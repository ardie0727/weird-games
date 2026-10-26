// A tiny PySpark DataFrame translator. It turns a chain like
//   orders.filter(F.col("city") == "Pune").groupBy("category").agg(F.sum("amount").alias("total"))
// into SQL so it can run on the same in-browser tables. This is not Spark.
// It only lets the game check PySpark answers by result.

export class PyError extends Error {}

type Tok = { t: "str" | "num" | "id" | "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s|\\/.test(c)) {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j++;
      if (j >= src.length) throw new PyError("Unclosed string.");
      out.push({ t: "str", v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) {
      out.push({ t: "num", v: num[0] });
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      out.push({ t: "id", v: id[0] });
      i += id[0].length;
      continue;
    }
    const op = /^(==|!=|>=|<=|[<>()\[\],.&|~=*+\-/])/.exec(src.slice(i));
    if (op) {
      out.push({ t: "op", v: op[0] });
      i += op[0].length;
      continue;
    }
    throw new PyError(`Unexpected character "${c}".`);
  }
  return out;
}

const AGG: Record<string, string> = { sum: "SUM", avg: "AVG", mean: "AVG", max: "MAX", min: "MIN", count: "COUNT" };
const ident = (s: string) => {
  if (s === "*") return "*";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) throw new PyError(`Bad column name "${s}".`);
  return s;
};
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

interface Arg {
  kw?: string;
  sql: string;
  raw: Tok[];
}

class Parser {
  i = 0;
  toks: Tok[];
  constructor(toks: Tok[]) {
    this.toks = toks;
  }
  peek(o = 0) {
    return this.toks[this.i + o];
  }
  eat(v?: string): Tok {
    const t = this.toks[this.i];
    if (!t) throw new PyError("Code ends too early.");
    if (v !== undefined && t.v !== v) throw new PyError(`Expected "${v}" but found "${t.v}".`);
    this.i++;
    return t;
  }
  isOp(v: string) {
    const t = this.peek();
    return t && t.t === "op" && t.v === v;
  }

  // expression grammar ------------------------------------------------------
  expr(colCtx: boolean): string {
    let left = this.and(colCtx);
    while (this.isOp("|")) {
      this.eat();
      left = `(${left} OR ${this.and(colCtx)})`;
    }
    return left;
  }
  and(colCtx: boolean): string {
    let left = this.not(colCtx);
    while (this.isOp("&")) {
      this.eat();
      left = `(${left} AND ${this.not(colCtx)})`;
    }
    return left;
  }
  not(colCtx: boolean): string {
    if (this.isOp("~")) {
      this.eat();
      return `(NOT ${this.not(colCtx)})`;
    }
    return this.cmp(colCtx);
  }
  cmp(colCtx: boolean): string {
    const left = this.arith(colCtx);
    const t = this.peek();
    if (t && t.t === "op" && ["==", "!=", ">", "<", ">=", "<="].includes(t.v)) {
      this.eat();
      const right = this.arith(false);
      const op = t.v === "==" ? "=" : t.v === "!=" ? "<>" : t.v;
      return `(${left} ${op} ${right})`;
    }
    return left;
  }
  arith(colCtx: boolean): string {
    let left = this.postfix(colCtx);
    while (this.isOp("+") || this.isOp("-") || this.isOp("*") || this.isOp("/")) {
      const op = this.eat().v;
      left = `(${left} ${op} ${this.postfix(false)})`;
    }
    return left;
  }
  postfix(colCtx: boolean): string {
    let e = this.primary(colCtx);
    while (this.isOp(".")) {
      this.eat();
      const m = this.eat().v;
      const args = this.callArgs(false);
      switch (m) {
        case "alias":
        case "name":
          e = `${e} AS ${ident(unq(args[0]))}`;
          break;
        case "desc":
          e = `${e} DESC`;
          break;
        case "asc":
          e = `${e} ASC`;
          break;
        case "isNull":
          e = `(${e} IS NULL)`;
          break;
        case "isNotNull":
          e = `(${e} IS NOT NULL)`;
          break;
        case "isin":
          e = `(${e} IN (${args.map((a) => a.sql).join(", ")}))`;
          break;
        case "between":
          e = `(${e} BETWEEN ${args[0].sql} AND ${args[1].sql})`;
          break;
        case "cast":
          e = `CAST(${e} AS ${/int/i.test(unq(args[0])) ? "INTEGER" : /double|float/i.test(unq(args[0])) ? "REAL" : "TEXT"})`;
          break;
        default:
          throw new PyError(`Column method .${m}() isn't supported in this arcade.`);
      }
    }
    return e;
  }
  primary(colCtx: boolean): string {
    const t = this.eat();
    if (t.t === "str") return colCtx ? ident(t.v) : lit(t.v);
    if (t.t === "num") return t.v;
    if (t.t === "op" && t.v === "(") {
      const e = this.expr(colCtx);
      this.eat(")");
      return e;
    }
    if (t.t === "op" && t.v === "*") return "*";
    if (t.t === "id") {
      if (t.v === "True") return "1";
      if (t.v === "False") return "0";
      if (t.v === "None") return "NULL";
      let fn = t.v;
      if ((fn === "F" || fn === "functions") && this.isOp(".")) {
        this.eat(".");
        fn = this.eat().v;
      }
      if (!this.isOp("(")) throw new PyError(`Unknown name "${t.v}".`);
      const args = this.callArgs(true);
      return this.fn(fn, args);
    }
    throw new PyError(`Unexpected "${t.v}".`);
  }
  fn(fn: string, args: Arg[]): string {
    if (fn === "col" || fn === "column") return ident(unq(args[0]));
    if (fn === "lit") {
      const r = args[0].raw[0];
      return r?.t === "str" ? lit(r.v) : args[0].sql;
    }
    if (AGG[fn]) {
      const a = args[0]?.sql ?? "*";
      return `${AGG[fn]}(${a})`;
    }
    if (fn === "countDistinct" || fn === "count_distinct") return `COUNT(DISTINCT ${args.map((a) => a.sql).join(", ")})`;
    if (fn === "round") return `ROUND(${args[0].sql}, ${args[1] ? args[1].raw[0]?.v ?? args[1].sql : 0})`;
    if (fn === "desc") return `${args[0].sql} DESC`;
    if (fn === "asc") return `${args[0].sql} ASC`;
    if (fn === "upper" || fn === "lower") return `${fn.toUpperCase()}(${args[0].sql})`;
    if (fn === "coalesce") return `COALESCE(${args.map((a) => a.sql).join(", ")})`;
    throw new PyError(`F.${fn}() isn't supported in this arcade.`);
  }
  /** Parse "( args )". String args are column names when colCtx is true. */
  callArgs(colCtx: boolean): Arg[] {
    this.eat("(");
    const args: Arg[] = [];
    while (!this.isOp(")")) {
      let kw: string | undefined;
      if (this.peek()?.t === "id" && this.peek(1)?.t === "op" && this.peek(1)?.v === "=") {
        kw = this.eat().v;
        this.eat("=");
      }
      const start = this.i;
      let sql: string;
      if (this.isOp("[")) {
        this.eat("[");
        const items: string[] = [];
        while (!this.isOp("]")) {
          items.push(this.expr(colCtx));
          if (this.isOp(",")) this.eat(",");
        }
        this.eat("]");
        sql = items.join(", ");
      } else {
        sql = this.expr(colCtx);
      }
      args.push({ kw, sql, raw: this.toks.slice(start, this.i) });
      if (this.isOp(",")) this.eat(",");
      else if (!this.isOp(")")) throw new PyError(`Expected "," or ")" but found "${this.peek()?.v}".`);
    }
    this.eat(")");
    return args;
  }
}

function unq(a: Arg | undefined): string {
  if (!a) throw new PyError("Missing argument.");
  const r = a.raw[0];
  if (r?.t === "str" || r?.t === "num" || r?.t === "id") return r.v;
  return a.sql;
}

interface Q {
  src: string;
  select: string | null;
  where: string[];
  group: string | null;
  order: string | null;
  limit: number | null;
  distinct: boolean;
}

const fresh = (src: string): Q => ({ src, select: null, where: [], group: null, order: null, limit: null, distinct: false });

function toSql(q: Q): string {
  let s = `SELECT ${q.distinct ? "DISTINCT " : ""}${q.select ?? "*"} FROM ${q.src}`;
  if (q.where.length) s += ` WHERE ${q.where.join(" AND ")}`;
  if (q.group) s += ` GROUP BY ${q.group}`;
  if (q.order) s += ` ORDER BY ${q.order}`;
  if (q.limit !== null) s += ` LIMIT ${q.limit}`;
  return s;
}

const isPristine = (q: Q) => !q.select && !q.where.length && !q.group && !q.order && q.limit === null && !q.distinct;
let aliasN = 0;
function wrap(q: Q): Q {
  return fresh(`(${toSql(q)}) AS s${++aliasN}`);
}

/** Translate a PySpark chain to one SQL query. `tables` are the DataFrame names you may start from or join. */
export function pysparkToSql(code: string, tables: string[]): string {
  aliasN = 0;
  let src = code.trim();
  src = src.replace(/^[A-Za-z_]\w*\s*=\s*/, ""); // result = ...
  const p = new Parser(tokenize(src));
  // Strip wrapping parentheses: ( orders .filter(...) )
  let depth = 0;
  while (p.isOp("(")) {
    p.eat();
    depth++;
  }
  const head = p.eat();
  if (head.t !== "id" || !tables.includes(head.v)) throw new PyError(`Start from a DataFrame: ${tables.join(" or ")}.`);
  let q = fresh(head.v);
  let pendingGroup: string | null = null;
  let scalarCount = false;

  while (p.isOp(".")) {
    p.eat(".");
    const m = p.eat().v;
    if (scalarCount) throw new PyError(".count() returns a number, so nothing can come after it.");
    if (pendingGroup !== null && m !== "agg" && m !== "count") throw new PyError(`After .groupBy() you need .agg() or .count(), not .${m}().`);
    switch (m) {
      case "filter":
      case "where": {
        const args = p.callArgs(false);
        const a = args[0];
        if (!a) throw new PyError(".filter() needs a condition.");
        const cond = a.raw.length === 1 && a.raw[0].t === "str" ? a.raw[0].v : a.sql;
        if (!isPristine(q) && (q.select || q.group || q.order || q.limit !== null || q.distinct)) q = wrap(q);
        q.where.push(`(${cond})`);
        break;
      }
      case "select": {
        const args = p.callArgs(true);
        if (q.select || q.group || q.order || q.limit !== null || q.distinct) q = wrap(q);
        q.select = args.map((a) => a.sql).join(", ");
        break;
      }
      case "withColumn": {
        const args = p.callArgs(false);
        const name = ident(unq(args[0]));
        if (q.group || q.order || q.limit !== null || q.distinct) q = wrap(q);
        q.select = `${q.select ?? "*"}, ${args[1].sql} AS ${name}`;
        break;
      }
      case "groupBy":
      case "groupby": {
        const args = p.callArgs(true);
        if (!args.length) throw new PyError(".groupBy() needs at least one column.");
        if (!isPristine(q) && (q.select || q.group || q.order || q.limit !== null || q.distinct)) q = wrap(q);
        pendingGroup = args.map((a) => a.sql).join(", ");
        break;
      }
      case "agg": {
        const args = p.callArgs(true);
        if (pendingGroup === null) {
          if (q.select || q.group || q.order || q.limit !== null || q.distinct) q = wrap(q);
          q.select = args.map((a) => a.sql).join(", ");
        } else {
          q.select = `${pendingGroup}, ${args.map((a) => a.sql).join(", ")}`;
          q.group = pendingGroup;
          pendingGroup = null;
        }
        break;
      }
      case "count": {
        p.callArgs(false);
        if (pendingGroup !== null) {
          q.select = `${pendingGroup}, COUNT(*) AS count`;
          q.group = pendingGroup;
          pendingGroup = null;
        } else {
          if (!isPristine(q)) q = wrap(q);
          q.select = "COUNT(*) AS count";
          scalarCount = true;
        }
        break;
      }
      case "orderBy":
      case "sort": {
        const args = p.callArgs(true);
        const asc = args.find((a) => a.kw === "ascending");
        const cols = args.filter((a) => !a.kw).map((a) => a.sql);
        if (q.limit !== null) q = wrap(q);
        const dir = asc && (asc.sql === "0" || asc.raw[0]?.v === "False") ? " DESC" : "";
        q.order = cols.map((c) => (/\b(ASC|DESC)$/.test(c) ? c : c + dir)).join(", ");
        break;
      }
      case "limit": {
        const args = p.callArgs(false);
        const n = Number(unq(args[0]));
        if (!Number.isInteger(n) || n < 0) throw new PyError(".limit() needs a whole number.");
        if (q.limit !== null) q = wrap(q);
        q.limit = n;
        break;
      }
      case "distinct":
      case "dropDuplicates":
      case "drop_duplicates": {
        const args = p.callArgs(true);
        if (args.length) throw new PyError("dropDuplicates with a column subset isn't supported here. Use .select(...).distinct().");
        if (q.order || q.limit !== null || q.group) q = wrap(q);
        q.distinct = true;
        break;
      }
      case "join": {
        p.eat("(");
        let other = p.eat();
        if ((other.v === "F" || other.v === "functions") && p.isOp(".")) {
          p.eat(".");
          if (p.eat().v !== "broadcast") throw new PyError("Only F.broadcast(df) is supported inside join().");
          p.eat("(");
          other = p.eat();
          p.eat(")");
        }
        if (other.t !== "id" || !tables.includes(other.v)) throw new PyError(`Join with a DataFrame: ${tables.join(" or ")}.`);
        let on: string | null = null;
        let how = "inner";
        while (p.isOp(",")) {
          p.eat(",");
          let kw = "";
          if (p.peek()?.t === "id" && p.peek(1)?.v === "=") {
            kw = p.eat().v;
            p.eat("=");
          }
          const t = p.peek();
          if (p.isOp("[")) {
            p.eat("[");
            const cols: string[] = [];
            while (!p.isOp("]")) {
              cols.push(ident(p.eat().v));
              if (p.isOp(",")) p.eat(",");
            }
            p.eat("]");
            on = cols.join(", ");
          } else if (t?.t === "str") {
            p.eat();
            if (kw === "how" || (!kw && on !== null)) how = t.v;
            else on = ident(t.v);
          } else throw new PyError("Write join(other, on=\"key\", how=\"inner\").");
        }
        p.eat(")");
        if (!on) throw new PyError("join() needs on=\"column\".");
        const left = isPristine(q) ? q.src : `(${toSql(q)}) AS s${++aliasN}`;
        const h = how.toLowerCase();
        if (h === "left_anti" || h === "anti" || h === "leftanti") {
          q = fresh(left);
          q.where.push(`${on} NOT IN (SELECT ${on} FROM ${other.v} WHERE ${on} IS NOT NULL)`);
        } else if (h === "left_semi" || h === "semi" || h === "leftsemi") {
          q = fresh(left);
          q.where.push(`${on} IN (SELECT ${on} FROM ${other.v})`);
        } else {
          const kind = h === "inner" ? "JOIN" : h === "left" || h === "left_outer" || h === "leftouter" ? "LEFT JOIN" : h === "cross" ? "CROSS JOIN" : null;
          if (!kind) throw new PyError(`Join type "${how}" isn't supported here.`);
          q = fresh(`${left} ${kind} ${other.v} USING (${on})`);
        }
        break;
      }
      default:
        throw new PyError(`.${m}() isn't supported in this arcade.`);
    }
  }
  if (pendingGroup !== null) throw new PyError(".groupBy() must be followed by .agg() or .count().");
  while (depth-- > 0) p.eat(")");
  if (p.peek()) throw new PyError(`Unexpected "${p.peek()!.v}" after the chain.`);
  return toSql(q);
}
