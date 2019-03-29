"use strict";

const MappedDisposable = require("mapped-disposable");


/**
 * Helper class to simplify the observation of multiple config keys.
 *
 * Its callback function is fired once, regardless of how many keys
 * were changed at any one time. Execution is always asynchronous, so
 * changes to multiple config keys only result in one "grouped" call.
 *
 * @property {Function} callback
 *   A callback, always invoked without arguments in the instance's own context.
 *
 * @property {MappedDisposables} disposables
 *   Subscriptions returned by {@link atom.config.observe}.
 *
 * @extends {Set}
 * @internal
 * @class
 */
class ObservedKeyList extends Set {
	
	
	/**
	 * Initialise a new list, optionally with {@link #callback} and keys.
	 *
	 * @param {Function} callback - Function assigned to instance's {@link #callback}
	 * @param {String|String[]} [keys] - Optional keys to observe upon initialisation
	 * @throws {TypeError} If callback parameter is supplied and not a function.
	 * @constructor
	 */
	constructor(callback = null, ...keys){
		if(callback !== null && "function" !== typeof callback)
			throw new TypeError("Callback argument is not a function");
		super();
		this.callback = callback;
		this.disposables = new MappedDisposable();
		keys.length && this.add(...keys);
	}
	
	
	/**
	 * Observe one or more config keys.
	 * 
	 * @public
	 * @example <caption>Basic usage</caption>
	 *   // These lines all equate to the same thing
	 *   list.add("editor.fontSize editor.fontFamily");
	 *   list.add(["editor.fontSize", "editor.fontFamily"]);
	 *   list.add("editor.fontSize", "editorFontFamily");
	 *
	 * @param {String|String[]} keys
	 *   One or more config-keys to observe, which may be a whitespace-separated
	 *   lists, or an {@link Array} of strings. Duplicate entries are ignored.
	 *
	 * @return {ObservedKeyList}
	 *   Reference to the calling instance, for parity with {@link Set.prototype.add}.
	 */
	add(...keys){
		for(const key of this.normaliseKeys(keys)){
			if(super.has(key)) continue;
			super.add(key);
			this.disposables.add(key, atom.config.observe(key, () => {
				if(this.callbackQueued || !this.callback) return;
				this.callbackQueued = true;
				process.nextTick(() => {
					this.callbackQueued = false;
					this.callback();
				});
			}));
		}
		return this;
	}
	
	
	/**
	 * Stop observing one or more config keys. No callback is fired during removal.
	 *
	 * @public
	 * @example <caption>Basic usage</caption>
	 *   const keys = new ObservedKeyList();
	 *   keys.add("editor.fontSize", "editor.fontFamily");
	 *   keys.delete("editor.fontFamily");
	 *   keys.size == 1;
	 *
	 * @param {String|String[]} keys
	 *   A list of config-keys to stop observing, which may be expressed as an array
	 *   or whitespace-delimited string of names. Keys are not required to exist on
	 *   the instance.
	 *
	 * @return {ObservedKeyList}
	 *   Reference to the calling instance.
	 */
	delete(...keys){
		for(const key of this.normaliseKeys(keys)){
			super.delete(key);
			this.disposables.dispose(key);
		}
		return this;
	}
	
	
	/**
	 * Stop observing every key currently registered with the instance.
	 *
	 * @return {void} Returns nothing for parity with {@link Set.prototype.clear}.
	 * @public
	 */
	clear(){
		super.clear();
		this.disposables.dispose();
		this.disposables = new MappedDisposable();
	}
	
	
	/**
	 * Alias of {@link #add}.
	 * @alias add
	 */
	observe(...keys){
		return this.add(...keys);
	}
	
	
	/**
	 * Alias of {@link #delete}.
	 * @alias delete
	 */
	unobserve(...keys){
		return this.delete(...keys);
	}
	
	
	/**
	 * Another alias of {@link #delete}.
	 * @alias delete
	 */
	remove(...keys){
		return this.delete(...keys);
	}
	
	
	/**
	 * "Flatten" a (possibly nested) list of strings into a single-level array.
	 * Strings are split by whitespace as separate elements of the final array.
	 *
	 * @param {Array|String} input
	 * @return {String[]} An array of strings
	 * @internal
	 */
	normaliseKeys(input, refs = null){
		refs = refs || new WeakSet();
		switch(typeof input){
			default:
				input = String(input);
				// Fall-through
			case "string":
				input = [input];
				break;
			case "object":
				if(!(Symbol.iterator in input))
					throw new TypeError("Object is not iterable");
				refs.add(input);
				input = Array.from(input);
		}
		const output = [];
		for(const value of input){
			if(!value) continue;
			switch(typeof value){
				case "string":
					output.push(...value.trim().split(/\s+/));
					break;
				case "object":
					if(refs.has(value)) continue;
					refs.add(value);
					output.push(...this.normaliseKeys(value, refs));
			}
		}
		return output;
	}
}

// TODO: Replace with instance fields once supported
Object.defineProperties(ObservedKeyList.prototype, {
	[Symbol.toStringTag]: {value: "ObservedKeyList"},
	callback:             {value: null, writable: true},
	disposables:          {value: null, writable: true},
});

module.exports = ObservedKeyList;
