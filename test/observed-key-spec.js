"use strict";

const ObservedKeyList = require("../lib/observed-key-list.js");
const MappedDisposable = require("mapped-disposable");


describe("ObservedKeyList", () => {
	when("initialised", () => {
		it("assigns a new MappedDisposable to its `.disposables`", () => {
			expect(new ObservedKeyList()).to.have.property("disposables").that.eqls(new MappedDisposable());
		});
		
		it("accepts a callback function as an argument", () => {
			const fn = () => true;
			const kl = new ObservedKeyList(fn);
			expect(kl.callback).to.equal(fn);
		});
		
		it("allows the callback argument to be omitted", () => {
			const kl = new ObservedKeyList();
			expect(kl).to.have.property("callback").that.equals(null);
		});
		
		it("allows the callback to be assigned post-construction", () => {
			const fn = () => true;
			const kl = new ObservedKeyList();
			expect(kl.callback).to.be.null;
			kl.callback = fn;
			expect(kl.callback).to.equal(fn);
		});
		
		it("raises an exception if callback isn't a function", () => {
			const err = [TypeError, "Callback argument is not a function"];
			expect(() => new ObservedKeyList({value: 50})).to.throw(...err);
			expect(() => new ObservedKeyList(50))         .to.throw(...err);
			expect(() => new ObservedKeyList(false))      .to.throw(...err);
		});
	});
	
	when("a key is added", () => {
		it("observes it immediately", () => {
			let size = -1;
			const fn = () => size = atom.config.get("editor.fontSize");
			const kl = new ObservedKeyList(fn);
			kl.add("editor.fontSize");
			expect(size).to.equal(atom.config.get("editor.fontSize"));
		});
	});
});
