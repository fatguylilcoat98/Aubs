/* ============================================================================
   AUBS RUNTIME SERVICE — Calculation (Class 1, self-verifiable)
   Truth · Safety · We Got Your Back

   Arithmetic is exact, so the runtime computes it with CERTAINTY, model 0× —
   never sending "108273628+3747629" to a language model that will guess. A SAFE
   evaluator (tokenizer → shunting-yard → RPN; NO eval/Function) handles + - * / %
   ^, parentheses, unary minus, and "<x>% of <y>". Pulls the arithmetic out of a
   noisy question ("whats 5+5=y" → 5+5). Non-math / unparseable → null (falls
   through). Pure runtime: no corpus, no asset, no citation, no hallucination.

   Environment-agnostic: module.exports (Node) or window.AUBS_CALC.
   ========================================================================== */
(function () {
  "use strict";

  function tokenize(expr) {
    var s = String(expr || ""), toks = [], i = 0;
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) { var j = i + 1; while (j < s.length && /[0-9.]/.test(s[j])) j++; var n = parseFloat(s.slice(i, j)); if (isNaN(n)) return null; toks.push({ t: "num", v: n }); i = j; continue; }
      if ("+-*/%^".indexOf(c) >= 0) { toks.push({ t: "op", v: c }); i++; continue; }
      if (c === "(") { toks.push({ t: "lp" }); i++; continue; }
      if (c === ")") { toks.push({ t: "rp" }); i++; continue; }
      return null;                                       // any other char → not a clean expression
    }
    return toks;
  }
  var PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };
  function toRPN(toks) {
    var out = [], ops = [];
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (tk.t === "num") out.push(tk);
      else if (tk.t === "op") {
        var prev = toks[i - 1];
        if (tk.v === "-" && (!prev || prev.t === "op" || prev.t === "lp")) out.push({ t: "num", v: 0 });  // unary minus
        while (ops.length) { var top = ops[ops.length - 1]; if (top.t === "op" && (PREC[top.v] > PREC[tk.v] || (PREC[top.v] === PREC[tk.v] && tk.v !== "^"))) out.push(ops.pop()); else break; }
        ops.push(tk);
      } else if (tk.t === "lp") ops.push(tk);
      else if (tk.t === "rp") { while (ops.length && ops[ops.length - 1].t !== "lp") out.push(ops.pop()); if (!ops.length) return null; ops.pop(); }
    }
    while (ops.length) { var o = ops.pop(); if (o.t === "lp") return null; out.push(o); }
    return out;
  }
  function evalRPN(rpn) {
    var st = [];
    for (var i = 0; i < rpn.length; i++) {
      var tk = rpn[i];
      if (tk.t === "num") { st.push(tk.v); continue; }
      var b = st.pop(), a = st.pop(); if (a === undefined || b === undefined) return null;
      var r;
      switch (tk.v) { case "+": r = a + b; break; case "-": r = a - b; break; case "*": r = a * b; break;
        case "/": if (b === 0) return null; r = a / b; break; case "%": if (b === 0) return null; r = a % b; break;
        case "^": r = Math.pow(a, b); break; default: return null; }
      st.push(r);
    }
    return st.length === 1 ? st[0] : null;
  }
  function evaluate(expr) {
    var toks = tokenize(expr); if (!toks || !toks.length) return null;
    if (!toks.some(function (t) { return t.t === "op"; })) return null;   // must be an operation, not a lone number
    var rpn = toRPN(toks); if (!rpn) return null;
    var v = evalRPN(rpn);
    return (v == null || !isFinite(v)) ? null : v;
  }

  function fmt(n) {
    if (Number.isInteger(n)) return n.toString();
    return Number(n.toPrecision(12)).toString();
  }

  // Extract a clean arithmetic expression from a possibly-noisy question.
  function extractExpr(q) {
    var t = String(q || "").replace(/×/g, "*").replace(/÷/g, "/").replace(/(\d),(?=\d)/g, "$1");
    if (t.indexOf("=") >= 0) t = t.slice(0, t.indexOf("="));     // take the left side of an "=" if present
    var m = t.match(/[-(]*\s*[0-9.][0-9.\s()+\-*/%^]*[0-9.)]/);  // run may begin with '(' or a unary '-'
    if (!m) return null;
    var expr = m[0].trim();
    if (!/^[0-9.\s()+\-*/%^]+$/.test(expr)) return null;
    if (!/[+\-*/%^]/.test(expr.replace(/^\s*-\s*/, ""))) return null;   // a real (binary) operator, not just a leading sign
    return expr;
  }

  function makePack() {
    var PROOF = { class: "self_verifiable", source: "AUBS calculation", model_called: false };
    function respond(q) {
      var s = String(q || "");
      // "<x>% of <y>"
      var m = s.replace(/(\d),(?=\d)/g, "$1").match(/(-?\d+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(-?\d+(?:\.\d+)?)/i);
      if (m) { var pct = parseFloat(m[1]), base = parseFloat(m[2]); var r = base * pct / 100; return { answer: fmt(pct) + "% of " + fmt(base) + " = " + fmt(r) + ".", proof: PROOF, factId: "calc:percent" }; }
      var expr = extractExpr(s);
      if (expr) { var v = evaluate(expr); if (v != null) return { answer: expr.replace(/\s+/g, " ") + " = " + fmt(v) + ".", proof: PROOF, factId: "calc" }; }
      return null;
    }
    return { id: "calc", name: "AUBS calculation", version: "v1", proof_class: "self_verifiable",
      source: "AUBS calculation", license: "n/a (computation)", evaluate: evaluate, extractExpr: extractExpr, respond: respond, proof: PROOF };
  }

  var API = { makePack: makePack, evaluate: evaluate, extractExpr: extractExpr };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CALC = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_CALC = API;
})();
