/* ============================================================================
   AUBS RUNTIME SERVICE — Unit Conversion (Class 1, self-verifiable)
   Truth · Safety · We Got Your Back

   Not a corpus — a COMPUTATION the runtime owns. "5 miles in km" is exact and
   deterministic, so the runtime answers it with CERTAINTY, model 0×. No data
   asset, no lazy-load, no citation, no hallucination. Pure runtime.

   Design filter (Architect Mode): "can the runtime own this reliably enough that
   the model no longer needs to?" For unit conversion the answer is an emphatic yes.

   Environment-agnostic: module.exports (Node) or window.AUBS_CONVERSIONS.
   ========================================================================== */
(function () {
  "use strict";

  // Each unit declares its factor to a per-dimension base. Temperature is affine, handled apart.
  var UNITS = [
    // length (base: meter)
    u("length", 1, "meters", ["m", "meter", "meters", "metre", "metres"]),
    u("length", 1000, "kilometers", ["km", "kilometer", "kilometers", "kilometre", "kilometres"]),
    u("length", 0.01, "centimeters", ["cm", "centimeter", "centimeters", "centimetre", "centimetres"]),
    u("length", 0.001, "millimeters", ["mm", "millimeter", "millimeters", "millimetre", "millimetres"]),
    u("length", 1609.344, "miles", ["mi", "mile", "miles"]),
    u("length", 0.9144, "yards", ["yd", "yard", "yards"]),
    u("length", 0.3048, "feet", ["ft", "foot", "feet"]),
    u("length", 0.0254, "inches", ["in", "inch", "inches"]),
    u("length", 1852, "nautical miles", ["nmi", "nauticalmile", "nauticalmiles"]),
    // mass (base: gram)
    u("mass", 1, "grams", ["g", "gram", "grams"]),
    u("mass", 1000, "kilograms", ["kg", "kilogram", "kilograms"]),
    u("mass", 0.001, "milligrams", ["mg", "milligram", "milligrams"]),
    u("mass", 1e6, "tonnes", ["t", "tonne", "tonnes", "metricton", "metrictons"]),
    u("mass", 453.59237, "pounds", ["lb", "lbs", "pound", "pounds"]),
    u("mass", 28.349523125, "ounces", ["oz", "ounce", "ounces"]),
    u("mass", 6350.29318, "stone", ["st", "stone", "stones"]),
    // volume (base: liter)
    u("volume", 1, "liters", ["l", "liter", "liters", "litre", "litres"]),
    u("volume", 0.001, "milliliters", ["ml", "milliliter", "milliliters", "millilitre", "millilitres"]),
    u("volume", 3.785411784, "gallons", ["gal", "gallon", "gallons"]),
    u("volume", 0.946352946, "quarts", ["qt", "quart", "quarts"]),
    u("volume", 0.473176473, "pints", ["pt", "pint", "pints"]),
    u("volume", 0.2365882365, "cups", ["cup", "cups"]),
    u("volume", 0.0295735295625, "fluid ounces", ["floz", "fluidounce", "fluidounces"]),
    u("volume", 0.01478676478125, "tablespoons", ["tbsp", "tablespoon", "tablespoons"]),
    u("volume", 0.00492892159375, "teaspoons", ["tsp", "teaspoon", "teaspoons"]),
    // time (base: second)
    u("time", 1, "seconds", ["s", "sec", "secs", "second", "seconds"]),
    u("time", 60, "minutes", ["min", "mins", "minute", "minutes"]),
    u("time", 3600, "hours", ["h", "hr", "hrs", "hour", "hours"]),
    u("time", 86400, "days", ["d", "day", "days"]),
    u("time", 604800, "weeks", ["wk", "week", "weeks"]),
    // speed (base: m/s)
    u("speed", 1, "m/s", ["mps", "m/s", "meterspersecond"]),
    u("speed", 0.277777778, "km/h", ["kph", "kmh", "km/h", "kmph", "kilometersperhour"]),
    u("speed", 0.44704, "mph", ["mph", "mi/h", "milesperhour"]),
    // digital storage (base: byte, decimal SI)
    u("data", 1, "bytes", ["byte", "bytes"]),
    u("data", 1e3, "kilobytes", ["kb", "kilobyte", "kilobytes"]),
    u("data", 1e6, "megabytes", ["mb", "megabyte", "megabytes"]),
    u("data", 1e9, "gigabytes", ["gb", "gigabyte", "gigabytes"]),
    u("data", 1e12, "terabytes", ["tb", "terabyte", "terabytes"])
  ];
  function u(dim, factor, display, names) { return { dim: dim, factor: factor, display: display, names: names }; }

  // Temperature is affine (offset + scale), not a single factor — kept separate.
  var TEMP = { c: 1, celsius: 1, centigrade: 1, f: 1, fahrenheit: 1, k: 1, kelvin: 1 };
  function tempCanon(s) { return (s === "celsius" || s === "centigrade") ? "c" : (s === "fahrenheit" ? "f" : (s === "kelvin" ? "k" : s)); }
  function toCelsius(v, from) { return from === "c" ? v : from === "f" ? (v - 32) * 5 / 9 : v - 273.15; }
  function fromCelsius(c, to) { return to === "c" ? c : to === "f" ? c * 9 / 5 + 32 : c + 273.15; }
  function tempName(t) { return t === "c" ? "°C" : t === "f" ? "°F" : "K"; }

  var ALIAS = Object.create(null);
  for (var i = 0; i < UNITS.length; i++) for (var j = 0; j < UNITS[i].names.length; j++) ALIAS[UNITS[i].names[j]] = UNITS[i];

  var PROOF = { class: "self_verifiable", source: "AUBS unit conversion", model_called: false };

  // lowercase + strip degree sign / dots / spaces. Do NOT strip trailing 's' — the alias table
  // already lists singular AND plural forms explicitly.
  function normUnit(tok) { return String(tok || "").toLowerCase().replace(/[°.\s]/g, ""); }

  // Deterministic numeric formatting: up to 7 significant figures, trailing zeros trimmed.
  function fmt(n) {
    if (!isFinite(n)) return String(n);
    if (n === 0) return "0";
    var s = (Math.abs(n) >= 1e-4 && Math.abs(n) < 1e15) ? Number(n.toPrecision(7)).toString() : n.toExponential(6);
    return s;
  }

  // convert(value, fromTok, toTok) -> { value, fromDisplay, toDisplay } | null
  function convert(value, fromTok, toTok) {
    var f = normUnit(fromTok), t = normUnit(toTok);
    // temperature (affine)
    var ft = tempCanon(f), tt = tempCanon(t);
    if (TEMP[f] !== undefined && TEMP[t] !== undefined) {
      var out = fromCelsius(toCelsius(value, ft), tt);
      return { value: out, fromDisplay: tempName(ft), toDisplay: tempName(tt), temp: true };
    }
    var fu = ALIAS[f], tu = ALIAS[t];
    if (!fu || !tu || fu.dim !== tu.dim) return null;     // unknown unit or dimension mismatch
    return { value: value * fu.factor / tu.factor, fromDisplay: fu.display, toDisplay: tu.display };
  }

  // Parse a natural conversion question -> { value, from, to } | null
  function parse(q) {
    var s = String(q || "").toLowerCase().replace(/[°]/g, " ").replace(/,/g, "");
    var m;
    // "how many <to> (are) in <num> <from>"
    if ((m = s.match(/\bhow many\s+([a-z/]+)\s+(?:are\s+)?(?:in|per)\s+(-?\d+(?:\.\d+)?)\s*([a-z/]+)/)))
      return { value: parseFloat(m[2]), from: m[3], to: m[1] };
    // "(convert) <num> <from> (in|to|into|as) <to>"
    if ((m = s.match(/(?:convert\s+|what(?:'s| is)\s+)?(-?\d+(?:\.\d+)?)\s*([a-z/]+)\s+(?:in|into|to|as)\s+([a-z/]+)/)))
      return { value: parseFloat(m[1]), from: m[2], to: m[3] };
    return null;
  }

  function respond(q) {
    var p = parse(q);
    if (!p) return null;
    var r = convert(p.value, p.from, p.to);
    if (!r) return null;                                   // not a real/compatible unit pair → fall through
    return { answer: fmt(p.value) + " " + r.fromDisplay + " = " + fmt(r.value) + " " + r.toDisplay + ".", proof: PROOF, factId: "conversion" };
  }

  function makePack() {
    return {
      id: "conversions", name: "AUBS unit conversion", version: "v1", proof_class: "self_verifiable",
      source: "AUBS unit conversion", license: "n/a (computation)",
      convert: convert, parse: parse, respond: respond, proof: PROOF
    };
  }

  var API = { makePack: makePack, convert: convert, parse: parse, respond: respond };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CONVERSIONS = API;
  else if (typeof globalThis !== "undefined") globalThis.AUBS_CONVERSIONS = API;
})();
