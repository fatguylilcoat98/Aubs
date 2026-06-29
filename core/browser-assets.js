/* ============================================================================
   AUBS — core/browser-assets.js  (GENERATED — do not edit by hand)
   Source of truth: core/cac/schemas/*.json, core/gel/policy-bundle.schema.json,
   core/gel/default-policy-bundle.json, core/memory/memory.schema.json,
   core/skills/skill.schema.json. Regenerate: node tools/gen-browser-assets.cjs

   Loaded as a classic <script> BEFORE the CAC/GEL/kernel modules so their browser
   branches can read these globals. Inert: defines globals only, runs no behavior.
   ========================================================================== */
(function () {
  "use strict";
  if (typeof window === "undefined") return;
  window.AUBS_CAC_SCHEMAS = {
  "intent": {
    "$id": "aubs/cac/intent",
    "title": "CAC Intent v0.1",
    "description": "The user's request before execution. The first object every pipeline produces.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "cac_version",
      "intent_id",
      "created_at",
      "user_text",
      "source",
      "constraints"
    ],
    "properties": {
      "cac_version": {
        "const": "0.1"
      },
      "intent_id": {
        "type": "string"
      },
      "created_at": {
        "type": "string",
        "format": "date-time"
      },
      "user_text": {
        "type": "string"
      },
      "source": {
        "enum": [
          "user",
          "system",
          "test",
          "import"
        ]
      },
      "context_refs": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "constraints": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "max_egress",
          "data_classification",
          "local_only",
          "requires_user_approval"
        ],
        "properties": {
          "max_egress": {
            "enum": [
              "none",
              "redacted",
              "full"
            ]
          },
          "allowed_providers": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "data_classification": {
            "enum": [
              "public",
              "personal",
              "sensitive"
            ]
          },
          "local_only": {
            "type": "boolean"
          },
          "requires_user_approval": {
            "type": "boolean"
          }
        }
      }
    }
  },
  "plan": {
    "$id": "aubs/cac/plan",
    "title": "CAC Plan v0.1",
    "description": "The DETERMINISTIC execution plan, produced before any model call. No model is consulted to build a plan.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "cac_version",
      "plan_id",
      "intent_id",
      "created_at",
      "steps",
      "requires_governance",
      "status"
    ],
    "properties": {
      "cac_version": {
        "const": "0.1"
      },
      "plan_id": {
        "type": "string"
      },
      "intent_id": {
        "type": "string"
      },
      "created_at": {
        "type": "string",
        "format": "date-time"
      },
      "requires_governance": {
        "type": "boolean"
      },
      "status": {
        "enum": [
          "draft",
          "ready",
          "executed",
          "failed"
        ]
      },
      "steps": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "step_type"
          ],
          "properties": {
            "step_type": {
              "enum": [
                "memory_read",
                "memory_write",
                "retrieve",
                "model_call",
                "tool_call",
                "deterministic_answer",
                "refusal"
              ]
            },
            "target": {
              "type": "string"
            },
            "egress": {
              "enum": [
                "none",
                "redacted",
                "full"
              ]
            },
            "detail": {
              "type": "string"
            }
          }
        }
      }
    }
  },
  "governance": {
    "$id": "aubs/cac/governance-decision",
    "title": "CAC Governance Decision v0.1",
    "description": "The policy outcome attached to a plan. Produced by the GEL (Milestone 2); the shape is fixed now so the GEL has a target.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "cac_version",
      "decision_id",
      "plan_id",
      "decision",
      "winning_rule",
      "precedence_level",
      "policy_bundle_hash",
      "created_at"
    ],
    "properties": {
      "cac_version": {
        "const": "0.1"
      },
      "decision_id": {
        "type": "string"
      },
      "plan_id": {
        "type": "string"
      },
      "decision": {
        "enum": [
          "allow",
          "deny",
          "modify",
          "require_reauth"
        ]
      },
      "winning_rule": {
        "type": "string"
      },
      "precedence_level": {
        "enum": [
          "regulatory",
          "org",
          "group",
          "user",
          "default"
        ]
      },
      "policy_bundle_hash": {
        "type": "string"
      },
      "reason": {
        "type": "string"
      },
      "created_at": {
        "type": "string",
        "format": "date-time"
      }
    }
  },
  "result": {
    "$id": "aubs/cac/result",
    "title": "CAC Result v0.1",
    "description": "The final output of an executed plan.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "cac_version",
      "result_id",
      "intent_id",
      "plan_id",
      "status",
      "output_text",
      "created_at"
    ],
    "properties": {
      "cac_version": {
        "const": "0.1"
      },
      "result_id": {
        "type": "string"
      },
      "intent_id": {
        "type": "string"
      },
      "plan_id": {
        "type": "string"
      },
      "status": {
        "enum": [
          "ok",
          "blocked",
          "error",
          "partial"
        ]
      },
      "output_text": {
        "type": "string"
      },
      "model_id": {
        "type": [
          "string",
          "null"
        ]
      },
      "provider_id": {
        "type": [
          "string",
          "null"
        ]
      },
      "created_at": {
        "type": "string",
        "format": "date-time"
      },
      "grounding": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "tag"
        ],
        "properties": {
          "tag": {
            "enum": [
              "grounded",
              "inferred",
              "general",
              "unknown"
            ]
          },
          "grounding_source": {
            "type": [
              "string",
              "null"
            ]
          },
          "memory_refs": {
            "type": "array",
            "items": {
              "type": "string"
            }
          }
        }
      }
    }
  },
  "failure": {
    "$id": "aubs/cac/failure",
    "title": "CAC Failure v0.1",
    "description": "An EXPLICIT failure state. Failure is always a first-class object, never a silent fallback.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "cac_version",
      "failure_id",
      "intent_id",
      "plan_id",
      "failure_type",
      "message",
      "recoverable",
      "created_at"
    ],
    "properties": {
      "cac_version": {
        "const": "0.1"
      },
      "failure_id": {
        "type": "string"
      },
      "intent_id": {
        "type": [
          "string",
          "null"
        ]
      },
      "plan_id": {
        "type": [
          "string",
          "null"
        ]
      },
      "failure_type": {
        "enum": [
          "policy_denied",
          "no_eligible_provider",
          "model_error",
          "validation_error",
          "timeout",
          "unsafe_blocked",
          "internal_error"
        ]
      },
      "message": {
        "type": "string"
      },
      "recoverable": {
        "type": "boolean"
      },
      "created_at": {
        "type": "string",
        "format": "date-time"
      }
    }
  },
  "execution_contract": {
    "$id": "aubs/cac/execution_contract",
    "title": "AUBS Execution Contract",
    "description": "Per-turn governed envelope the kernel mints and hands to a provider. Distinct from the Provider Contract (the static adapter interface). A provider may only be invoked inside a valid Execution Contract; no contract = no provider call.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "contract_id",
      "intent_id",
      "app_identity",
      "user_intent",
      "allowed_provider",
      "verdict",
      "output_constraints",
      "safety_classification",
      "egress_boundary",
      "provenance_obligations"
    ],
    "properties": {
      "cac_version": {
        "type": "string"
      },
      "contract_id": {
        "type": "string"
      },
      "intent_id": {
        "type": "string"
      },
      "app_identity": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "assistant_name",
          "persona_ref",
          "app_id"
        ],
        "properties": {
          "assistant_name": {
            "type": "string"
          },
          "persona_ref": {
            "type": "string"
          },
          "app_id": {
            "type": "string"
          }
        }
      },
      "user_intent": {
        "type": "string"
      },
      "allowed_provider": {
        "type": [
          "string",
          "null"
        ]
      },
      "allowed_tools": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "allowed_memory_scopes": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "verdict": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "decision",
          "winning_rule",
          "policy_bundle_hash"
        ],
        "properties": {
          "decision": {
            "enum": [
              "allow",
              "deny",
              "modify",
              "require_reauth"
            ]
          },
          "winning_rule": {
            "type": [
              "string",
              "null"
            ]
          },
          "policy_bundle_hash": {
            "type": "string"
          }
        }
      },
      "output_constraints": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "max_tokens": {
            "type": "integer"
          },
          "must_not_claim_identity": {
            "type": "boolean"
          },
          "grounding_rules": {
            "type": "string"
          },
          "refusal_obligations": {
            "type": "string"
          }
        }
      },
      "safety_classification": {
        "enum": [
          "normal",
          "harm_topic",
          "self_harm"
        ]
      },
      "egress_boundary": {
        "enum": [
          "none",
          "redacted",
          "full"
        ]
      },
      "provenance_obligations": {
        "type": "string"
      },
      "replay_metadata": {
        "type": "object"
      }
    }
  }
};
  window.AUBS_GEL_BUNDLE_SCHEMA = {
  "$id": "aubs/gel/policy-bundle",
  "title": "GEL Policy Bundle v0.1",
  "description": "A deterministic JSON policy bundle the GEL evaluates a CAC Plan against. Not full Cedar yet; a simple, rigid, fail-closed rule format.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "bundle_id",
    "bundle_version",
    "require_explicit_allow",
    "policies"
  ],
  "properties": {
    "bundle_id": {
      "type": "string"
    },
    "bundle_version": {
      "type": "string"
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "require_explicit_allow": {
      "type": "boolean"
    },
    "policies": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "policy_id",
          "precedence_level",
          "effect",
          "enabled",
          "reason",
          "match"
        ],
        "properties": {
          "policy_id": {
            "type": "string"
          },
          "precedence_level": {
            "enum": [
              "regulatory",
              "org",
              "group",
              "user",
              "default"
            ]
          },
          "effect": {
            "enum": [
              "allow",
              "deny",
              "modify",
              "require_reauth"
            ]
          },
          "enabled": {
            "type": "boolean"
          },
          "reason": {
            "type": "string"
          },
          "match": {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "step_type": {
                "enum": [
                  "memory_read",
                  "retrieve",
                  "model_call",
                  "tool_call",
                  "deterministic_answer",
                  "refusal"
                ]
              },
              "step_type_in": {
                "type": "array",
                "items": {
                  "enum": [
                    "memory_read",
                    "retrieve",
                    "model_call",
                    "tool_call",
                    "deterministic_answer",
                    "refusal"
                  ]
                }
              },
              "provider_id": {
                "type": "string"
              },
              "provider_id_in": {
                "type": "array",
                "items": {
                  "type": "string"
                }
              },
              "egress": {
                "enum": [
                  "none",
                  "redacted",
                  "full"
                ]
              },
              "egress_in": {
                "type": "array",
                "items": {
                  "enum": [
                    "none",
                    "redacted",
                    "full"
                  ]
                }
              },
              "max_egress": {
                "enum": [
                  "none",
                  "redacted",
                  "full"
                ]
              },
              "data_classification": {
                "enum": [
                  "public",
                  "personal",
                  "sensitive"
                ]
              },
              "data_classification_in": {
                "type": "array",
                "items": {
                  "enum": [
                    "public",
                    "personal",
                    "sensitive"
                  ]
                }
              },
              "local_only": {
                "type": "boolean"
              },
              "requires_user_approval": {
                "type": "boolean"
              }
            }
          }
        }
      }
    }
  }
};
  window.AUBS_GEL_DEFAULT_BUNDLE = {
  "bundle_id": "aubs-default",
  "bundle_version": "0.1",
  "created_at": "2026-06-29T00:00:00Z",
  "require_explicit_allow": false,
  "policies": [
    {
      "policy_id": "org-deny-sensitive-egress",
      "precedence_level": "org",
      "effect": "deny",
      "enabled": true,
      "reason": "Sensitive data may not leave the device.",
      "match": {
        "data_classification": "sensitive",
        "egress_in": [
          "redacted",
          "full"
        ]
      }
    },
    {
      "policy_id": "org-reauth-on-full-egress",
      "precedence_level": "org",
      "effect": "require_reauth",
      "enabled": true,
      "reason": "Sending full (un-redacted) data off-device requires re-authentication.",
      "match": {
        "egress": "full",
        "data_classification_in": [
          "public",
          "personal"
        ]
      }
    },
    {
      "policy_id": "default-allow-local",
      "precedence_level": "default",
      "effect": "allow",
      "enabled": true,
      "reason": "Local, on-device execution is allowed by default.",
      "match": {}
    }
  ]
};
  window.AUBS_MEMORY_SCHEMA = {
  "$id": "aubs/memory/tsm",
  "title": "AUBS Typed Scoped Memory record v0.1",
  "description": "A governed memory asset. Carries ownership, scope, provenance, confidence, lifecycle, and tamper-evidence (prev_hash/record_hash/signature added by the store). Append-only: a delete is a superseding/deactivating record, never a physical erase.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "record_version",
    "memory_id",
    "type",
    "user_id",
    "owner",
    "scope",
    "content",
    "inferred",
    "confidence",
    "source_classification",
    "provenance",
    "created_at"
  ],
  "properties": {
    "record_version": {
      "const": "tsm-1"
    },
    "memory_id": {
      "type": "string",
      "minLength": 1
    },
    "type": {
      "enum": [
        "FACT",
        "PREFERENCE",
        "PROFILE",
        "TASK",
        "DOCUMENT",
        "SUMMARY",
        "SYSTEM",
        "INFERENCE"
      ]
    },
    "user_id": {
      "type": "string",
      "minLength": 1
    },
    "owner": {
      "type": "string",
      "minLength": 1
    },
    "scope": {
      "enum": [
        "private",
        "conversation",
        "workspace",
        "family",
        "organization",
        "device"
      ]
    },
    "read_scopes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "content": {
      "type": [
        "string",
        "null"
      ]
    },
    "inferred": {
      "type": "boolean"
    },
    "confidence": {
      "type": "number"
    },
    "source_classification": {
      "enum": [
        "user_stated",
        "model_inferred",
        "document",
        "system",
        "imported"
      ]
    },
    "provenance": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "timestamp"
      ],
      "properties": {
        "created_from": {
          "type": [
            "string",
            "null"
          ]
        },
        "conversation_id": {
          "type": [
            "string",
            "null"
          ]
        },
        "decision_record": {
          "type": [
            "string",
            "null"
          ]
        },
        "source": {
          "type": [
            "string",
            "null"
          ]
        },
        "timestamp": {
          "type": "string"
        }
      }
    },
    "evidence_refs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "supersedes": {
      "type": [
        "string",
        "null"
      ]
    },
    "deleted": {
      "type": "boolean"
    },
    "created_at": {
      "type": "string"
    },
    "updated_at": {
      "type": [
        "string",
        "null"
      ]
    },
    "expires_at": {
      "type": [
        "string",
        "null"
      ]
    }
  }
};
  window.AUBS_SKILL_SCHEMA = {
  "$id": "aubs/skills/skill",
  "title": "AUBS Skill Manifest v0.1",
  "description": "A declared, governed capability. A skill describes work and REQUESTS resources (providers, memory, tools) through the constitution — it never executes them. Runtime methods (execute/healthCheck) are validated structurally; this schema validates the declared manifest.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "skill_id",
    "name",
    "version",
    "description",
    "inputs",
    "outputs",
    "required_permissions",
    "allowed_tools",
    "allowed_providers",
    "allowed_memory_scopes",
    "requires_network",
    "requires_user_confirmation",
    "risk_level",
    "supported_operations"
  ],
  "properties": {
    "skill_id": {
      "type": "string",
      "minLength": 1
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "version": {
      "type": "string",
      "minLength": 1
    },
    "description": {
      "type": "string"
    },
    "inputs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "outputs": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "required_permissions": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "allowed_tools": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "allowed_providers": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "allowed_memory_scopes": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "requires_network": {
      "type": "boolean"
    },
    "requires_user_confirmation": {
      "type": "boolean"
    },
    "risk_level": {
      "enum": [
        "low",
        "medium",
        "high",
        "critical"
      ]
    },
    "supported_operations": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "enabled": {
      "type": "boolean"
    },
    "metadata": {
      "type": "object"
    }
  }
};
})();
