/* ============================================================================
   AUBS CAC — validation (Milestone 1)
   Truth · Safety · We Got Your Back

   A small, dependency-free validator for the subset of JSON Schema the CAC uses:
   type (incl. union types + integer), required, properties, additionalProperties:false
   (rejects UNKNOWN fields), enum, const, items, and a loose date-time format check.

   It NEVER coerces. Invalid objects fail closed with helpful, path-prefixed errors.
   Kept tiny on purpose — the CAC is meant to be boring and rigid (Blueprint Ch.4).
   ========================================================================== */
(function () {
  "use strict";

  var CAC_VERSION = "0.1";

  function typeOf(v) {
    if (v === null) return "null";
    if (Array.isArray(v)) return "array";
    return typeof v; // "object" | "string" | "number" | "boolean" | "undefined"
  }

  function check(schema, val, path, errors) {
    if (!schema || typeof schema !== "object") return;

    if (Object.prototype.hasOwnProperty.call(schema, "const")) {
      if (val !== schema.const) errors.push(path + ": expected const " + JSON.stringify(schema.const) + ", got " + JSON.stringify(val));
      return;
    }
    if (schema.enum) {
      if (schema.enum.indexOf(val) < 0) errors.push(path + ": " + JSON.stringify(val) + " is not one of [" + schema.enum.join(", ") + "]");
      return;
    }
    if (schema.type) {
      var types = Array.isArray(schema.type) ? schema.type : [schema.type];
      var actual = typeOf(val);
      var matches = types.some(function (t) {
        if (t === "integer") return actual === "number" && Number.isInteger(val);
        return t === actual;
      });
      if (!matches) { errors.push(path + ": expected type " + types.join("|") + ", got " + actual); return; }
    }

    // object
    if ((schema.type === "object" || schema.properties) && val && typeOf(val) === "object") {
      var props = schema.properties || {};
      (schema.required || []).forEach(function (r) {
        if (!Object.prototype.hasOwnProperty.call(val, r)) errors.push(path + ": missing required field '" + r + "'");
      });
      if (schema.additionalProperties === false) {
        Object.keys(val).forEach(function (k) {
          if (!Object.prototype.hasOwnProperty.call(props, k)) errors.push(path + ": unknown field '" + k + "' (additionalProperties: false)");
        });
      }
      Object.keys(props).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(val, k)) check(props[k], val[k], path + "." + k, errors);
      });
    }

    // array
    if ((schema.type === "array" || schema.items) && Array.isArray(val) && schema.items) {
      val.forEach(function (item, i) { check(schema.items, item, path + "[" + i + "]", errors); });
    }

    // loose format checks (never coerce)
    if (schema.format === "date-time" && typeof val === "string" && isNaN(Date.parse(val))) {
      errors.push(path + ": invalid date-time '" + val + "'");
    }
  }

  function validate(schema, obj) {
    var errors = [];
    check(schema, obj, "$", errors);
    return { valid: errors.length === 0, errors: errors };
  }

  // throw-on-invalid wrapper (fail closed) used by builders
  function assertValid(schema, obj, label) {
    var r = validate(schema, obj);
    if (!r.valid) throw new Error("CAC validation failed (" + (label || schema.$id || "object") + "): " + r.errors.join("; "));
    return obj;
  }

  var SCHEMAS = null;
  function loadSchemas() {
    if (SCHEMAS) return SCHEMAS;
    if (typeof require !== "undefined") {
      SCHEMAS = {
        intent:     require("./schemas/intent.schema.json"),
        plan:       require("./schemas/plan.schema.json"),
        governance: require("./schemas/governance-decision.schema.json"),
        result:     require("./schemas/result.schema.json"),
        failure:    require("./schemas/failure.schema.json")
      };
    } else if (typeof window !== "undefined" && window.AUBS_CAC_SCHEMAS) {
      SCHEMAS = window.AUBS_CAC_SCHEMAS; // browser: schemas injected at build time
    } else {
      SCHEMAS = {};
    }
    return SCHEMAS;
  }

  function byKind(kind) {
    var s = loadSchemas()[kind];
    if (!s) throw new Error("CAC: unknown schema kind '" + kind + "'");
    return s;
  }
  var API = {
    CAC_VERSION: CAC_VERSION,
    validate: validate,
    assertValid: assertValid,
    schema: byKind,
    validateIntent:     function (o) { return validate(byKind("intent"), o); },
    validatePlan:       function (o) { return validate(byKind("plan"), o); },
    validateGovernance: function (o) { return validate(byKind("governance"), o); },
    validateResult:     function (o) { return validate(byKind("result"), o); },
    validateFailure:    function (o) { return validate(byKind("failure"), o); }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_CAC_VALIDATE = API;
})();
