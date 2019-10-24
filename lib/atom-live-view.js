"use strict";

const {Disposable, Emitter, File} = require("atom");
const {existsSync, statSync} = require("fs");
const {basename} = require("path");
const MappedDisposable = require("mapped-disposable");
const ObservedKeyList = require("./observed-key-list.js");


class AtomLiveView{
	
	constructor(state = {}){
		this.autoRefresh = true;
		this.disposables = new MappedDisposable();
		this.emitter = new Emitter();
		
		this.element = document.createElement("div");
		this.element.className = this.constructor.slug;
		this.element.tabIndex = -1;
		
		this.editorId    = state.editorId;
		this.filePath    = state.filePath;
		this.offsets     = state.offsets;
		this.cachedTitle = state.title;
		
		// Config keys which trigger a redraw when changed
		Object.defineProperty(this, "observedKeys", {
			value: new ObservedKeyList(this.render.bind(this)),
			enumerable: false,
		});
		
		this.waitToLoad().then(() => {
			if(this.editorId){
				if(this.editor = this.editorForId(this.editorId)){
					this.emitter.emit("did-change-title");
					this.disposables.add(this.editor.onDidDestroy(() => this.watchFile(this.getPath())));
					this.handleEvents();
					this.render().then(() => this.restoreOffsets());
				}
				else this.watchFile(this.filePath);
			}
			else this.watchFile(this.filePath);
		});
	}
	
	
	/**
	 * Clear up memory when view is closed.
	 * @emits did-destroy
	 * @public
	 */
	destroy(){
		this.observedKeys.clear();
		if(this.emitter){
			this.emitter.emit("did-destroy");
			this.emitter.dispose();
			this.emitter = null;
		}
		if(this.disposables){
			this.disposables.dispose();
			this.disposables = null;
		}
	}
	
	
	/**
	 * Restore an instance from an earlier workspace session.
	 * @return {AtomLiveView}
	 * @public
	 */
	static get deserialize(){
		return params => new this(params);
	}
	
	
	/**
	 * Generate a serialisable representation of the view instance.
	 * @param {Object} [extraProps={}] - Additional properties to save
	 * @return {Object}
	 * @public
	 */
	serialize(extraProps = {}){
		return {
			deserializer: this.constructor.name,
			filePath: this.filePath,
			editorId: this.editorId,
			offsets:  [this.element.scrollLeft, this.element.scrollTop],
			title:    this.getTitle(),
			...extraProps,
		};
	}
	
	
	/**
	 * Return the first {@link TextEditor} whose ID matches the given string.
	 *
	 * @param {String} id
	 * @return {TextEditor|null}
	 * @internal
	 */
	editorForId(id){
		id = String(id);
		for(const editor of atom.workspace.getTextEditors())
			if(id === String(editor.id)) return editor;
		return null;
	}
	
	
	
	getTitle(){
		return this.file && this.getPath()
			? basename(this.getPath()) + " preview"
			: this.editor
				? this.editor.getTitle() + " preview"
				: (this.cachedTitle || "Preview");
	}
	
	
	getIconName(){
		return this.constructor.iconName;
	}
	
	
	getURI(){
		const {protocolName} = this.constructor;
		return this.file
			? protocolName + "://source:file@"   + this.getPath()
			: protocolName + "://source:editor@" + this.editorId;
	}
	
	
	getPath(){
		return this.file
			? this.file.getPath()
			: this.editor
				? this.editor.getPath()
				: this.cachedPath;
	}
	
	
	handleEvents(){
		const onChange = () => {
			if(this.autoRefresh){
				this.render();
				const pane = atom.workspace.paneForItem(this);
				if(pane && pane !== atom.workspace.getActivePane())
					pane.activateItem(this);
			}
		};
		if(this.file)
			this.disposables.add(this.file.onDidChange(onChange));
		else if(this.editor){
			const buffer = this.editor.getBuffer();
			this.disposables.add(
				buffer.onDidStopChanging(onChange),
				buffer.onDidSave(onChange),
				buffer.onDidReload(onChange),
				this.editor.onDidChangePath(() => this.emitter.emit("did-change-title"))
			);
		}
	}
	
	
	async getSource(){
		await this.waitToLoad();
		if(this.file && this.file.getPath()){
			const source = await this.file.read();
			if(null == source)
				throw new Error(`Unable to load ${this.file.getBaseName()}`);
			return source;
		}
		else if(this.editor)
			return this.editor.getText();
		else throw new Error("Unable to locate source");
	}
	
	
	observeConfig(...keys){
		this.observedKeys.add(...keys);
	}
	unobserveConfig(...keys){
		this.observedKeys.delete(...keys);
	}
	
	
	async render(){
		
	}
	
	
	/**
	 * Restore scroll offsets saved from the last workspace session.
	 * @internal
	 */
	restoreOffsets(){
		if(Array.isArray(this.offsets)){
			this.element.scrollLeft = +this.offsets[0] || 0;
			this.element.scrollTop  = +this.offsets[1] || 0;
		}
		this.offsets = null;
	}
	
	
	/**
	 * Return a {@link Promise} that resolves once every package has loaded.
	 * @return {Promise}
	 * @internal
	 */
	async waitToLoad(){
		if(!atom.packages.hasActivatedInitialPackages())
			return new Promise(resolve => this.disposables.add(
				atom.packages.onDidActivateInitialPackages(() => resolve())));
	}
	
	
	watchFile(path){
		this.file = new File(path);
		this.emitter.emit("did-change-title");
		this.disposables.add(this.file.onDidRename(() => this.emitter.emit("did-change-title")));
		this.handleEvents();
		this.render().then(() => this.restoreOffsets());
	}
	
	
	
	static get createView(){
		return (state = {}) => {
			const id   = state.editorId;
			const path = state.filePath;
			if(id || path && existsSync(path) && statSync(path).isFile())
				return new this(state);
		};
	}
	

	static get opener(){
		return uri => {
			let [protocol, ...path] = uri.split("://");
			if(protocol !== this.protocolName) return;
			try{ path = decodeURI(path.join("://")); }
			catch(e){ return; }
			
			return path.startsWith("source:editor@")
				? this.createView({editorId: path.substring(14)})
				: this.createView({filePath: path.replace(/^source:file@/i, "")});
		};
	}
	
	
	static get toggle(){
		return () => {
			if(atom.workspace.getActivePaneItem() instanceof this){
				atom.workspace.destroyActivePaneItem();
				return;
			}
			
			const editor = atom.workspace.getActiveTextEditor();
			if(!editor) return;
			this.remove(editor) || this.add(editor);
		};
	}
	
	
	static get add(){
		return editor => {
			const uri  = this.uriForEditor(editor);
			const pane = atom.workspace.getActivePane();
			const opts = {searchAllPanes: true};
			if(this.shouldSplit)
				opts.split = "right";
			atom.workspace.open(uri, opts).then(view => {
				if(pane && (view instanceof this))
					pane.activate();
			});
		};
	}
	
	
	static get remove(){
		return editor => {
			const uri  = this.uriForEditor(editor);
			const pane = atom.workspace.paneForURI(uri);
			if(pane){
				pane.destroyItem(pane.itemForURI(uri));
				return true;
			}
			return false;
		};
	}
	
	
	static get uriForEditor(){
		return editor => `${this.protocolName}://source:editor@${editor.id}`;
	}
	
	
	static get iconName()     { return "device-desktop"; }
	static get protocolName() { return "atom-live-view"; }
	static get shouldSplit()  { return true; }
	static get slug(){
		return this.name
			.replace(/([a-z]+)([A-Z])/g, (_, a, B) => `${a}-${B}`)
			.toLowerCase();
	}
}

module.exports = AtomLiveView;
