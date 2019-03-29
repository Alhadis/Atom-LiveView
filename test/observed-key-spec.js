"use strict";

const ObservedKeyList = require("../lib/observed-key-list.js");
const MappedDisposable = require("mapped-disposable");
const wait = ms => new Promise(resolve => setTimeout(() => resolve(), ms));


describe("ObservedKeyList", () => {
	const defaultSize   = atom.config.get("editor.fontSize");
	const defaultFamily = atom.config.get("editor.fontFamily");
	
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
		
		it("treats any excess arguments as keys to observe", () => {
			const fn = () => {};
			const kl = new ObservedKeyList(fn, "editor.fontSize", "editor.fontFamily");
			expect(kl.callback).to.equal(fn);
			expect(kl.size).to.equal(2);
			expect(kl.has("editor.fontSize")).to.be.true;
			expect(kl.has("editor.fontFamily")).to.be.true;
		});
	});
	
	when("a key is added", () => {
		it("observes it for changes", async () => {
			let calls = 0;
			const kl = new ObservedKeyList(() => ++calls);
			kl.add("editor.fontSize");
			await wait(10);
			expect(calls).to.equal(1);
			
			atom.config.set("editor.fontSize", "100");
			await wait(10);
			expect(calls).to.equal(2);
		});
		
		it("fires its callback asynchronously", async () => {
			let calls = 0;
			const kl = new ObservedKeyList(() => ++calls);
			kl.add("editor.fontSize");
			expect(calls).to.equal(0);
			await wait(10);
			expect(calls).to.equal(1);
		});
		
		when("it contains whitespace", () => {
			it("strips leading or trailing whitespace", async () => {
				let calls = 0;
				const kl = new ObservedKeyList(() => ++calls);
				kl.add(" \t editor.fontSize editor.fontFamily \t ");
				expect(kl.size).to.equal(2);
				expect(kl.has("editor.fontSize")).to.be.true;
				expect(kl.has("editor.fontFamily")).to.be.true;
				await wait(10);
				expect(calls).to.be.above(0);
			});
			
			it("splits it apart and observes each chunk", async () => {
				let calls = 0;
				const kl = new ObservedKeyList(() => ++calls);
				kl.add("editor.fontSize editor.fontFamily");
				expect(kl.size).to.equal(2);
				expect(kl.has("editor.fontSize")).to.be.true;
				expect(kl.has("editor.fontFamily")).to.be.true;
				expect(calls).to.equal(0);
				await wait(10);
				expect(calls).to.be.above(0);
			});
		});
		
		when("the key is an object", () => {
			it("observes its elements if the object is iterable", async () => {
				let calls = 0;
				const kl = new ObservedKeyList(() => ++calls);
				expect(calls).to.equal(0);
				kl.add(["editor.fontSize", "editor.fontFamily"]);
				expect(kl.size).to.equal(2);
				expect(kl.has("editor.fontSize")).to.be.true;
				expect(kl.has("editor.fontFamily")).to.be.true;
				await wait(10);
				expect(calls).to.above(0);
			});
			
			it("raises an exception if the object isn't iterable", () => {
				const fn = () => new ObservedKeyList(() => {}).add({foo: "bar"});
				expect(fn).to.throw(TypeError, "Object is not iterable");
			});
		});
		
		describe("If the key is already observed", () =>
			it("does nothing", async () => {
				let calls = 0;
				let kl = new ObservedKeyList(() => ++calls);
				kl.add("editor.fontSize");
				await wait(10);
				expect(calls).to.equal(1);
				
				kl.add(["editor.fontSize"]);
				await wait(10);
				expect(calls).to.equal(1);
				
				kl.add(["editor.fontSize", "editor.fontFamily"]);
				await wait(10);
				expect(calls).to.equal(2);
			}));
	});

	when("an observed key changes", () => {
		beforeEach("Resetting config values", () => {
			atom.config.set("editor.fontSize", defaultSize);
			atom.config.set("editor.fontFamily", defaultFamily);
		});
		
		it("fires its callback asynchronously", async () => {
			let calls = 0;
			const kl = new ObservedKeyList(() => ++calls);
			kl.add("editor.fontSize");
			expect(calls).to.equal(0);
			await wait(10);
			expect(calls).to.equal(1);
			
			atom.config.set("editor.fontSize", defaultSize * 2);
			await wait(10);
			expect(calls).to.equal(2);
		});
		
		it("fires its callback without any arguments", async () => {
			let calls = 0;
			let count = -1;
			const kl = new ObservedKeyList((...args) => { ++calls; count = args.length; });
			kl.add("editor.fontSize");
			await wait(10);
			expect(calls).to.equal(1);
			expect(count).to.equal(0);
			
			atom.config.set("editor.fontSize", defaultSize * 2);
			await wait(10);
			expect(calls).to.equal(2);
			expect(count).to.equal(0);
		});
		
		it("fires its callback in its own context", async () => {
			let ctx = null;
			const kl = new ObservedKeyList(function(){ ctx = this; });
			kl.add("editor.fontSize");
			await wait(10);
			expect(ctx).to.equal(kl);
			
			atom.config.set("editor.fontSize", defaultSize * 2);
			await wait(10);
			expect(ctx).to.equal(kl);
		});
		
		when("the key is changed repeatedly", () =>
			it("fires its callback only once", async () => {
				let calls = 0;
				const kl = new ObservedKeyList(() => ++calls);
				kl.add("editor.fontSize");
				await wait(10);
				expect(calls).to.equal(1);
				
				atom.config.set("editor.fontSize", defaultSize * 2);
				atom.config.set("editor.fontSize", defaultSize * 3);
				atom.config.set("editor.fontSize", defaultSize * 4);
				await wait(30);
				expect(calls).to.equal(2);
			}));
		
		when("multiple keys are changed simultaneously", () =>
			it("fires its callback only once", async () => {
				let calls = 0;
				const kl = new ObservedKeyList(() => ++calls);
				kl.add("editor.fontSize", "editor.fontFamily");
				expect(kl.size).to.equal(2);
				expect(calls).to.equal(0);
				await wait(10);
				expect(calls).to.equal(1);
				
				atom.config.set("editor.fontSize", defaultSize * 2);
				atom.config.set("editor.fontFamily", `ABC ${defaultFamily} XYZ`);
				expect(calls).to.equal(1);
				await wait(10);
				expect(calls).to.equal(2);
			}));
		
		when("the change is reverted before the callback fires", () =>
			it("fires its callback anyway", async () => {
				expect(atom.config.get("editor.fontSize")).to.equal(defaultSize);
				let calls = 0;
				const kl = new ObservedKeyList(() => ++calls);
				kl.add("editor.fontSize");
				await wait(10);
				expect(calls).to.equal(1);
				atom.config.set("editor.fontSize", defaultSize * 2);
				atom.config.set("editor.fontSize", defaultSize);
				await wait(30);
				expect(calls).to.equal(2);
			}));
	});

	when("a key is removed", () => {
		it("stops observing it for changes", async () => {
			let calls = 0;
			const kl = new ObservedKeyList(() => ++calls);
			kl.add("editor.fontSize");
			expect(kl.size).to.equal(1);
			expect(kl.has("editor.fontSize")).to.be.true;
			await wait(10);
			expect(calls).to.equal(1);
			
			kl.delete("editor.fontSize");
			expect(calls).to.equal(1);
			expect(kl.size).to.equal(0);
			expect(kl.has("editor.fontSize")).to.be.false;
			atom.config.set("editor.fontSize", defaultSize * 2);
			await wait(10);
			expect(calls).to.equal(1);
		});
		
		it("unobserves each key if removing several at once", async () => {
			let calls = 0;
			const kl = new ObservedKeyList(() => ++calls);
			kl.add("editor.fontSize", "editor.fontFamily");
			expect(kl.size).to.equal(2);
			expect(kl.has("editor.fontSize")).to.be.true;
			expect(kl.has("editor.fontFamily")).to.be.true;
			await wait(10);
			expect(calls).to.equal(1);
			
			kl.delete("editor.fontSize", "editor.fontFamily");
			expect(kl.size).to.equal(0);
			expect(kl.has("editor.fontSize")).to.be.false;
			expect(kl.has("editor.fontFamily")).to.be.false;
			await wait(10);
			expect(calls).to.equal(1);
		});
		
		when("the key wasn't even observed", () =>
			it("doesn't notice or care", () => {
				let calls = 0;
				const kl = new ObservedKeyList(() => ++calls);
				kl.delete("editor.fontSize");
				expect(kl.size).to.equal(0);
			}));
	});
	
	when("clearing a list's contents", () => {
		it("stops observing each key", async () => {
			let calls = 0;
			const kl = new ObservedKeyList(() => ++calls);
			kl.add("editor.fontSize", "editor.fontFamily");
			await wait(10);
			expect(calls).to.equal(1);
			
			kl.clear();
			expect(kl.size).to.equal(0);
			expect(kl.has("editor.fontSize")).to.be.false;
			expect(kl.has("editor.fontFamily")).to.be.false;
			atom.config.set("editor.fontSize", defaultSize * 2);
			atom.config.set("editor.fontFamily", defaultFamily);
			await wait(10);
			expect(calls).to.equal(1);
		});
		
		it("disposes of its `.disposables` object", () => {
			const {Disposable} = require("atom");
			let didDispose = false;
			const kl = new ObservedKeyList();
			const {disposables} = kl;
			kl.disposables.add(new Disposable(() => didDispose = true));
			kl.clear();
			expect(kl.disposables).to.be.an.instanceOf(MappedDisposable);
			expect(kl.disposables).not.to.equal(disposables);
			expect(didDispose).to.be.true;
		});
	});
});
