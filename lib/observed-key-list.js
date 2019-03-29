"use strict";

const MappedDisposable = require("mapped-disposable");


class ObservedKeyList extends Set {
	
	constructor(callback = null){
		if(callback !== null && "function" !== typeof callback)
			throw new TypeError("Callback argument is not a function");
		super();
		this.callback = callback;
		this.disposables = new MappedDisposable();
	}
	
	
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
	
	
	delete(...keys){
		for(const key of this.normaliseKeys(keys)){
			super.delete(key);
			this.disposables.dispose(key);
		}
		return this;
	}
	
	
	clear(){
		super.clear();
		this.disposables.dispose();
		this.disposables = new MappedDisposable();
	}
	
	
	observe(...keys){
		return this.add(...keys);
	}
	
	
	unobserve(...keys){
		return this.delete(...keys);
	}
	
	
	/**
	 * "Flatten" a (possibly nested) list of strings into a single-level array.
	 * Strings are split by whitespace as separate elements of the final array.
	 *
	 * @see {@link https://github.com/Alhadis/Utils}
	 * @param {Array|String} input
	 * @return {String[]} An array of strings
	 */
	normaliseKeys(input, refs = null){
		refs = refs || new WeakSet();
		input = "string" === typeof input
			? [input]
			: refs.add(input) && Array.from(input);
		
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
	changes:              {value: null, writable: true},
	disposables:          {value: null, writable: true},
});

module.exports = ObservedKeyList;
