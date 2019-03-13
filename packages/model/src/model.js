import {inspect} from 'util';
import {findFromOneOrMany} from '@superstore/util';

import {Field} from './field';

export class Model {
  constructor(object, {isDeserializing} = {}) {
    if (object !== undefined) {
      if (typeof object !== 'object') {
        throw new Error(
          `Type mismatch (model: '${this.constructor.getName()}', expected: 'object', provided: '${typeof object}')`
        );
      }

      if (object._type !== undefined) {
        const {_type: type, ...value} = object;
        const ObjectModel = this.constructor._getModel(type);
        object = new ObjectModel(value, {isDeserializing});
      }

      if (object.isOfType && object.isOfType('Model')) {
        if (!object.isOfType(this.constructor.getName())) {
          throw new Error(
            `Type mismatch (expected: '${this.constructor.getName()}', provided: '${object.constructor.getName()}')`
          );
        }
        return object;
      }

      for (const [name, value] of Object.entries(object)) {
        const field = isDeserializing ?
          this.constructor.getFieldBySerializedName(name) :
          this.constructor.getField(name);
        if (field) {
          this._setFieldValue(field, value, {isDeserializing});
        } else {
          // Silently ignore undefined fields
        }
      }
    }

    if (!isDeserializing) {
      this._applyDefaults();
    }
  }

  serialize({
    includeFields = true,
    includeChangedFields,
    includeUndefinedFields,
    includeOwnedFields
  } = {}) {
    const result = {_type: this.constructor.getName()};
    this.constructor.forEachField(field => {
      if (
        includeFields === true ||
        (Array.isArray(includeFields) && includeFields.includes(field.name)) ||
        (includeChangedFields && this.fieldIsChanged(field)) ||
        (includeOwnedFields && field.isOwned)
      ) {
        let value = this._getFieldValue(field);
        value = field.serializeValue(value, {
          includeFields,
          includeChangedFields,
          includeUndefinedFields,
          includeOwnedFields
        });
        if (value !== undefined) {
          result[field.serializedName || field.name] = value;
        }
      }
    });
    return result;
  }

  toJSON() {
    return this.serialize();
  }

  static deserialize(object) {
    return new this(object, {isDeserializing: true});
  }

  clone() {
    return this.constructor.deserialize(this.serialize());
  }

  _applyDefaults() {
    this.constructor.forEachField(field => {
      let value = field.default;
      if (value === undefined) {
        return;
      }
      if (this._getFieldValue(field) !== undefined) {
        return;
      }
      while (typeof value === 'function') {
        value = value.call(this);
      }
      if (value === undefined) {
        return;
      }
      this._setFieldValue(field, value);
    });
  }

  [inspect.custom]() {
    const object = {};
    this.constructor.forEachField(field => {
      const value = this._getFieldValue(field);
      if (value !== undefined) {
        object[field.name] = value;
      }
    });
    return object;
  }

  static defineField(name, type, options, descriptor) {
    if (descriptor.initializer) {
      options = {...options, default: descriptor.initializer};
    }

    const field = this.setField(name, type, options);

    descriptor.get = function () {
      return this._getFieldValue(field);
    };
    descriptor.set = function (val) {
      return this._setFieldValue(field, val);
    };

    delete descriptor.initializer;
    delete descriptor.writable;
  }

  static getField(name) {
    return this._fields?.[name];
  }

  static getFieldBySerializedName(name) {
    return this.forEachField(field => {
      if (field.serializedName) {
        return field.serializedName === name ? field : undefined;
      }
      return field.name === name ? field : undefined;
    });
  }

  static setField(name, type, options) {
    if (!Object.prototype.hasOwnProperty.call(this, '_fields')) {
      this._fields = {...this._fields};
    }
    let field = this._fields[name];
    if (field) {
      throw new Error(`Field already exists (name: '${name}')`);
    }
    field = new Field(name, type, options);
    this._fields[name] = field;
    return field;
  }

  static forEachField(func) {
    if (this._fields) {
      for (const field of Object.values(this._fields)) {
        const result = func(field);
        if (result !== undefined) {
          // Early return if the function returned something
          return result;
        }
      }
    }
  }

  forEachSubmodel(func) {
    return this.constructor.forEachField(field => {
      const value = this._getFieldValue(field);
      return findFromOneOrMany(value, value => {
        if (value?.isOfType && value.isOfType('Model')) {
          return func(value) !== undefined;
        }
      });
    });
  }

  _getFieldValue(field) {
    return this._fieldValues?.[field.name];
  }

  _setFieldValue(field, value, {isDeserializing} = {}) {
    if (!isDeserializing) {
      this._saveFieldValue(field);
    }
    value = field.createValue(value, this, {isDeserializing});
    if (this._fieldValues === undefined) {
      this._fieldValues = {};
    }
    this._fieldValues[field.name] = value;
    return value;
  }

  _saveFieldValue(field) {
    if (this._savedFieldValues === undefined) {
      this._savedFieldValues = {};
    }
    this._savedFieldValues[field.name] = this._getFieldValue(field);
  }

  commit() {
    this._savedFieldValues = undefined;

    this.forEachSubmodel(submodel => {
      submodel.commit();
    });
  }

  rollback() {
    if (this._savedFieldValues !== undefined) {
      for (const [name, value] of Object.entries(this._savedFieldValues)) {
        this._fieldValues[name] = value;
      }
      this._savedFieldValues = undefined;
    }

    this.forEachSubmodel(submodel => {
      submodel.rollback();
    });
  }

  isChanged() {
    return this._isChanged() === true;
  }

  _isChanged() {
    if (this._savedFieldValues !== undefined) {
      return true;
    }

    return this.forEachSubmodel(submodel => submodel._isChanged());
  }

  fieldIsChanged(field) {
    if (
      this._savedFieldValues &&
      Object.prototype.hasOwnProperty.call(this._savedFieldValues, field.name)
    ) {
      return true;
    }

    const value = this._getFieldValue(field);
    if (value !== undefined) {
      const changedValue = findFromOneOrMany(value, value => {
        if (value?.isOfType && value.isOfType('Model')) {
          return value.isChanged();
        }
      });
      if (changedValue !== undefined) {
        return true;
      }
    }

    return false;
  }

  static getName() {
    return this.name;
  }

  isOfType(name) {
    if (name === 'Model') {
      return true; // Optimization
    }

    let Model = this.constructor;
    while (Model) {
      if (Model.name === name) {
        return true;
      }
      Model = Object.getPrototypeOf(Model);
    }
    return false;
  }

  static _getModel(name) {
    const registry = this._getRegistry();
    const Model = registry[name];
    if (Model === undefined) {
      throw new Error(`Model not found (name: '${name}')`);
    }
    return Model;
  }

  static _getRegistry() {
    if (!this.$registry) {
      throw new Error(`Registry not found (model: ${this.getName()})`);
    }
    return this.$registry;
  }
}

export function field(type, options) {
  return function (target, name, descriptor) {
    target.constructor.defineField(name, type, options, descriptor);
  };
}
