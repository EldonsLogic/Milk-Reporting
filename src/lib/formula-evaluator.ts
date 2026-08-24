// A small, safe recursive-descent evaluator for custom metric formulas -
// deliberately NOT eval()/new Function(). Supports the same vocabulary the
// built-in derived metrics already use (see metric-catalog.ts formulas):
// +, -, *, /, parentheses, unary minus, numeric literals, field
// identifiers, and NULLIF(a, b) for safe division (Postgres semantics:
// returns null when a === b, so "x / NULLIF(y, 0)" is null - not
// Infinity/NaN - whenever y is 0).

type Token = { type: "num" | "ident" | "op" | "lparen" | "rparen" | "comma"; value: string };

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < formula.length && /[0-9.]/.test(formula[i])) num += formula[i++];
      tokens.push({ type: "num", value: num });
    } else if (/[a-zA-Z_]/.test(ch)) {
      let ident = "";
      while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) ident += formula[i++];
      tokens.push({ type: "ident", value: ident });
    } else if ("+-*/".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "lparen", value: ch });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "rparen", value: ch });
      i++;
    } else if (ch === ",") {
      tokens.push({ type: "comma", value: ch });
      i++;
    } else {
      throw new Error(`Unexpected character in formula: "${ch}"`);
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[], private fields: Record<string, number>) {}

  private peek() {
    return this.tokens[this.pos];
  }
  private next() {
    return this.tokens[this.pos++];
  }

  parse(): number | null {
    const result = this.parseExpr();
    if (this.pos < this.tokens.length) {
      throw new Error("Unexpected trailing tokens in formula");
    }
    return result;
  }

  private parseExpr(): number | null {
    let left = this.parseTerm();
    while (this.peek() && this.peek().type === "op" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.next().value;
      const right = this.parseTerm();
      if (left === null || right === null) {
        left = null;
      } else {
        left = op === "+" ? left + right : left - right;
      }
    }
    return left;
  }

  private parseTerm(): number | null {
    let left = this.parseFactor();
    while (this.peek() && this.peek().type === "op" && (this.peek().value === "*" || this.peek().value === "/")) {
      const op = this.next().value;
      const right = this.parseFactor();
      if (left === null || right === null) {
        left = null;
      } else if (op === "/") {
        left = right === 0 ? null : left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  private parseFactor(): number | null {
    const tok = this.peek();
    if (!tok) throw new Error("Unexpected end of formula");

    if (tok.type === "op" && tok.value === "-") {
      this.next();
      const val = this.parseFactor();
      return val === null ? null : -val;
    }
    if (tok.type === "num") {
      this.next();
      return parseFloat(tok.value);
    }
    if (tok.type === "lparen") {
      this.next();
      const val = this.parseExpr();
      if (!this.peek() || this.peek().type !== "rparen") throw new Error("Missing closing parenthesis");
      this.next();
      return val;
    }
    if (tok.type === "ident") {
      this.next();
      // Function call: NULLIF(a, b)
      if (this.peek() && this.peek().type === "lparen") {
        this.next();
        const args: (number | null)[] = [this.parseExpr()];
        while (this.peek() && this.peek().type === "comma") {
          this.next();
          args.push(this.parseExpr());
        }
        if (!this.peek() || this.peek().type !== "rparen") throw new Error("Missing closing parenthesis");
        this.next();

        if (tok.value.toUpperCase() === "NULLIF") {
          const [a, b] = args;
          return a === b ? null : a;
        }
        throw new Error(`Unknown function "${tok.value}"`);
      }
      // Field reference - unknown fields resolve to 0 (safe default, same
      // spirit as the built-in formulas' NULLIF-guarded division).
      return this.fields[tok.value] ?? 0;
    }
    throw new Error(`Unexpected token in formula: "${tok.value}"`);
  }
}

/**
 * Evaluates a formula like "spend / NULLIF(impressions, 0) * 1000" against
 * a flat field-name -> value map. Returns null when the result is not
 * computable (e.g. divide by zero via NULLIF), matching how the rest of
 * the app already treats "N/A".
 */
export function evaluateFormula(formula: string, fields: Record<string, number>): number | null {
  const tokens = tokenize(formula);
  return new Parser(tokens, fields).parse();
}

/** Throws with a helpful message if the formula can't be parsed at all - used to validate before saving. */
export function validateFormula(formula: string): { valid: boolean; error?: string } {
  try {
    evaluateFormula(formula, {});
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e instanceof Error ? e.message : "Invalid formula" };
  }
}
