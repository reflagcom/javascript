"use strict";

// Private fork of deepmerge 4.3.1's bundled CommonJS implementation (MIT).
// Upstream: https://github.com/TehShrike/deepmerge/tree/v4.3.1
// Security change: every destination write defines an own data property rather
// than invoking inherited setters, including __proto__ on either merge input.
// This fixes GHSA-gcqx-w48m-w2h4 while retaining the API used by Expo/RN CLI.
// Remove this fork when those consumers adopt a maintained, fixed dependency.

function isMergeableObject(value) {
  return !!value && typeof value === "object" && !isSpecial(value);
}

function isSpecial(value) {
  const stringValue = Object.prototype.toString.call(value);
  return (
    stringValue === "[object RegExp]" ||
    stringValue === "[object Date]" ||
    value.$$typeof === Symbol.for("react.element")
  );
}

function emptyTarget(value) {
  return Array.isArray(value) ? [] : {};
}

function cloneUnlessOtherwiseSpecified(value, options) {
  return options.clone !== false && options.isMergeableObject(value)
    ? deepmerge(emptyTarget(value), value, options)
    : value;
}

function defaultArrayMerge(target, source, options) {
  return target.concat(source).map(function (element) {
    return cloneUnlessOtherwiseSpecified(element, options);
  });
}

function getMergeFunction(key, options) {
  if (!options.customMerge) return deepmerge;
  const customMerge = options.customMerge(key);
  return typeof customMerge === "function" ? customMerge : deepmerge;
}

function getKeys(target) {
  return Object.keys(target).concat(
    Object.getOwnPropertySymbols(target).filter(function (symbol) {
      return Object.prototype.propertyIsEnumerable.call(target, symbol);
    }),
  );
}

function propertyIsOnObject(object, property) {
  try {
    return property in object;
  } catch {
    return false;
  }
}

function propertyIsUnsafe(target, key) {
  return (
    propertyIsOnObject(target, key) &&
    !(
      Object.prototype.hasOwnProperty.call(target, key) &&
      Object.prototype.propertyIsEnumerable.call(target, key)
    )
  );
}

function setOwnProperty(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function mergeObject(target, source, options) {
  const destination = {};
  if (options.isMergeableObject(target)) {
    getKeys(target).forEach(function (key) {
      setOwnProperty(
        destination,
        key,
        cloneUnlessOtherwiseSpecified(target[key], options),
      );
    });
  }
  getKeys(source).forEach(function (key) {
    if (propertyIsUnsafe(target, key)) return;
    if (
      propertyIsOnObject(target, key) &&
      options.isMergeableObject(source[key])
    ) {
      setOwnProperty(
        destination,
        key,
        getMergeFunction(key, options)(target[key], source[key], options),
      );
    } else {
      setOwnProperty(
        destination,
        key,
        cloneUnlessOtherwiseSpecified(source[key], options),
      );
    }
  });
  return destination;
}

function deepmerge(target, source, options) {
  options = options || {};
  options.arrayMerge = options.arrayMerge || defaultArrayMerge;
  options.isMergeableObject = options.isMergeableObject || isMergeableObject;
  options.cloneUnlessOtherwiseSpecified = cloneUnlessOtherwiseSpecified;

  const sourceIsArray = Array.isArray(source);
  const targetIsArray = Array.isArray(target);
  if (sourceIsArray !== targetIsArray) {
    return cloneUnlessOtherwiseSpecified(source, options);
  }
  if (sourceIsArray) return options.arrayMerge(target, source, options);
  return mergeObject(target, source, options);
}

deepmerge.all = function (array, options) {
  if (!Array.isArray(array))
    throw new Error("first argument should be an array");
  return array.reduce(function (previous, next) {
    return deepmerge(previous, next, options);
  }, {});
};

module.exports = deepmerge;
