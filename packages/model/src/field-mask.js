import isEqual from 'lodash/isEqual';
import isEmpty from 'lodash/isEmpty';
import cloneDeep from 'lodash/cloneDeep';

export class FieldMask {
  constructor(fields = {}) {
    if (typeof fields !== 'object' || fields === null) {
      throw new Error(`Expected an object (received: ${typeof fields})`);
    }

    this._fields = fields;
  }

  $serialize() {
    return cloneDeep(this._fields);
  }

  toJSON() {
    return this.$serialize();
  }

  $get(name) {
    if (typeof name !== 'string' || name === '') {
      throw new Error(`The 'name' paramter must be a non empty string`);
    }

    const subfields = this._fields[name];

    if (subfields === undefined) {
      return false;
    }

    if (subfields === true) {
      return true;
    }

    return new FieldMask(subfields);
  }

  $has(name) {
    if (typeof name !== 'string' || name === '') {
      throw new Error(`The 'name' parameter must be a non empty string`);
    }

    return this._fields[name] !== undefined;
  }

  $set(name, subfields) {
    if (typeof name !== 'string' || name === '') {
      throw new Error(`The 'name' paramter must be a non empty string`);
    }

    if (subfields === true) {
      this._fields[name] = true;
      return;
    }

    if (!isFieldMask(subfields)) {
      throw new Error(`Expected a FieldMask (received: ${typeof subfields})`);
    }

    this._fields[name] = subfields.$serialize();
  }

  $isEmpty() {
    return isEmpty(this._fields);
  }

  $includes(fields) {
    if (!isFieldMask(fields)) {
      throw new Error(`Expected a FieldMask (received: ${typeof fields})`);
    }

    function _includes(rootFields, rootOtherFields) {
      for (const [name, otherFields] of Object.entries(rootOtherFields)) {
        const fields = rootFields[name];
        if (fields === undefined) {
          return false;
        }
        if (typeof fields === 'object' && !_includes(fields, otherFields)) {
          return false;
        }
      }
      return true;
    }

    return _includes(this._fields, fields._fields);
  }

  static $isEqual(fields, otherFields) {
    if (!isFieldMask(fields)) {
      throw new Error(`Expected a FieldMask (received: ${typeof fields})`);
    }

    if (!isFieldMask(otherFields)) {
      throw new Error(`Expected a FieldMask (received: ${typeof otherFields})`);
    }

    return isEqual(fields._fields, otherFields._fields);
  }

  static $add(fields, otherFields) {
    if (!isFieldMask(fields)) {
      throw new Error(`Expected a FieldMask (received: ${typeof fields})`);
    }

    if (!isFieldMask(otherFields)) {
      throw new Error(`Expected a FieldMask (received: ${typeof otherFields})`);
    }

    function _merge(rootFields, rootOtherFields) {
      const mergedFields = {...rootFields};

      for (const [name, otherFields] of Object.entries(rootOtherFields)) {
        let fields = rootFields[name];

        if (otherFields === true) {
          if (typeof fields === 'object') {
            throw new Error(`Cannot merge two incompatible fieldMasks`);
          }
          if (fields === undefined) {
            mergedFields[name] = true;
          }
        } else if (typeof otherFields === 'object') {
          if (fields === true) {
            throw new Error(`Cannot merge two incompatible fieldMasks`);
          }
          if (fields === undefined) {
            fields = {};
          }
          mergedFields[name] = _merge(fields, otherFields);
        }
      }

      return mergedFields;
    }

    return new FieldMask(_merge(fields._fields, otherFields._fields));
  }

  static $remove(fields, otherFields) {
    if (!isFieldMask(fields)) {
      throw new Error(`Expected a FieldMask (received: ${typeof fields})`);
    }

    if (!isFieldMask(otherFields)) {
      throw new Error(`Expected a FieldMask (received: ${typeof otherFields})`);
    }

    function _remove(rootFields, rootOtherFields) {
      const rootRemainingFields = {};

      for (const [name, fields] of Object.entries(rootFields)) {
        const otherFields = rootOtherFields[name];

        if (otherFields === undefined) {
          rootRemainingFields[name] = fields;
        } else if (typeof otherFields === 'object') {
          const remainingFields = _remove(fields, otherFields);
          if (!isEmpty(remainingFields)) {
            rootRemainingFields[name] = remainingFields;
          }
        }
      }

      return rootRemainingFields;
    }

    return new FieldMask(_remove(fields._fields, otherFields._fields));
  }

  static $isFieldMask(object) {
    return isFieldMask(object);
  }
}

export function isFieldMask(object) {
  return typeof object?.constructor?.$isFieldMask === 'function';
}
