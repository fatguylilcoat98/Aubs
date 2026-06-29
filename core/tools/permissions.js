/* ============================================================================
   AUBS Constitutional Tool Framework — permission model (Milestone 10)
   Truth · Safety · We Got Your Back

   Every external capability (files, calendar, shell, network, camera, …) is a governed
   resource. A tool DECLARES the permissions it requires; the kernel decides whether they
   are granted. Permissions are an explicit, extensible vocabulary — undeclared methods
   and ungranted permissions never run.
   ========================================================================== */
(function () {
  "use strict";

  var PERMISSION_CATEGORIES = [
    "filesystem.read", "filesystem.write", "filesystem.delete",
    "calendar.read", "calendar.write", "contacts.read",
    "camera.capture", "microphone.capture",
    "network.http", "network.websocket",
    "shell.execute", "database.query"
  ];

  // permissions that require a specific device capability to be present
  var DEVICE_REQUIRED = { "camera.capture": "camera", "microphone.capture": "microphone" };
  // permissions that imply the network
  var NETWORK_PERMS = { "network.http": true, "network.websocket": true };

  function isPermission(p) { return PERMISSION_CATEGORIES.indexOf(p) !== -1; }
  function validatePermissions(perms) {
    if (!Array.isArray(perms)) return { ok: false, invalid: ["<not an array>"] };
    var invalid = perms.filter(function (p) { return !isPermission(p); });
    return { ok: invalid.length === 0, invalid: invalid };
  }
  // granted ⊇ required ?  returns { ok, missing:[...] }
  function hasPermissions(required, granted) {
    granted = granted || [];
    var missing = (required || []).filter(function (p) { return granted.indexOf(p) === -1; });
    return { ok: missing.length === 0, missing: missing };
  }
  function deviceRequirements(perms) {
    return (perms || []).map(function (p) { return DEVICE_REQUIRED[p]; }).filter(Boolean);
  }
  function needsNetwork(perms) { return (perms || []).some(function (p) { return NETWORK_PERMS[p]; }); }

  var API = {
    PERMISSION_CATEGORIES: PERMISSION_CATEGORIES, DEVICE_REQUIRED: DEVICE_REQUIRED, NETWORK_PERMS: NETWORK_PERMS,
    isPermission: isPermission, validatePermissions: validatePermissions, hasPermissions: hasPermissions,
    deviceRequirements: deviceRequirements, needsNetwork: needsNetwork
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else if (typeof window !== "undefined") window.AUBS_TOOL_PERMS = API;
})();
