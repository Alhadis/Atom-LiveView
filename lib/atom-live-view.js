"use strict";

const {CompositeDisposable, Disposable, Emitter, File} = require("atom");
const {existsSync, statSync} = require("fs");
const {basename} = require("path");
const ObservedKeyList = require("./observed-key-list.js");
const {editorForId, isItemVisible} = require("./utils.js");


class AtomLiveView{
	
	constructor(state = {}){
		this.disposables = new CompositeDisposable();
		this.emitter     = new Emitter();
		
		this.element = document.createElement("div");
		this.element.className = this.constructor.slug;
		this.element.tabIndex = -1;
		
		this.editorId    = state.editorId;
		this.filePath    = state.filePath;
		this.offsets     = state.offsets;
		this.cachedTitle = state.title;
		
		// Config keys which trigger a redraw when changed
		Object.defineProperty(this, "observedKeys", {
			value: new ObservedKeyList(this.handleRender.bind(this)),
			enumerable: false,
		});
		
		// Register commands which fire from preview-pane
		const cmds = this.registerCommands();
		if(Disposable.isDisposable(cmds))
			this.disposables.add(cmds);
		
		this.waitToLoad().then(() => {
			this.disposables.add(atom.workspace.observeActivePaneItem(item => {
				if(item === this && "pending" === this.renderState){
					this.renderState = "none";
					this.handleRender();
				}
			}));
			if(this.editorId){
				if(this.editor = editorForId(this.editorId)){
					this.emit("did-change-title");
					this.disposables.add(this.editor.onDidDestroy(() => this.watchFile(this.getPath())));
					this.handleEvents();
					this.handleRender();
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
			this.emit("did-destroy");
			this.emitter.dispose();
			this.emitter = null;
		}
		if(this.disposables){
			this.disposables.dispose();
			this.disposables = null;
		}
	}
	
	
	/**
	 * Trigger a named event.
	 * @param {String} eventName
	 * @param {*} [value]
	 * @public
	 */
	emit(eventName, value){
		if(this.emitter && !this.emitter.disposed)
			this.emitter.emit(eventName, value);
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
				: this.filePath;
	}
	
	
	getVisible(){
		return isItemVisible(this);
	}
	
	
	handleEvents(){
		const onChange = () => {
			if(this.autoRefresh){
				// Steal focus if we're allowed to
				if(this.autoFocus){
					const pane = atom.workspace.paneForItem(this);
					if(pane && pane !== atom.workspace.getActivePane())
						pane.activateItem(this);
				}
				this.handleRender();
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
				this.editor.onDidChangePath(() => this.emit("did-change-title"))
			);
		}
	}
	
	
	async handleRender(){
		if("rendering" === this.renderState || "pending" === this.renderState)
			return;
			
		// Start rendering if visible
		if(this.getVisible()){
			this.renderState = "rendering";
			this.emit("did-render-started");
			await this.render();
			this.renderState = "finished";
			this.emit("did-render-finish");
			this.restoreOffsets();
		}
		
		// Otherwise, wait until view becomes active
		else{
			this.renderState = "pending";
			this.emit("did-queue-render");
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
	
	
	/**
	 * Generate a serialisable representation of the view instance.
	 * @return {Object}
	 * @public
	 */
	serialize(){
		return {
			deserializer: this.constructor.name,
			filePath: this.getPath(),
			editorId: this.editorId,
			offsets:  [this.element.scrollLeft, this.element.scrollTop],
			title:    this.getTitle(),
		};
	}
	
	
	registerCommands(){
		
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
		this.emit("did-change-title");
		this.disposables.add(this.file.onDidRename(() => this.emit("did-change-title")));
		this.handleEvents();
		this.handleRender();
	}
	
	
	
	static get createView(){
		return (state = {}) => {
			const id   = state.editorId;
			const path = state.filePath;
			if(id || path && existsSync(path) && statSync(path).isFile())
				return new this(state);
		};
	}
	

	static get deserialize(){
		return params => new this(params);
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

// TODO: Replace these with class field initialisers once supported
Object.defineProperties(AtomLiveView.prototype, {
	/**
	 * Automatically re-render whenever changes are detected to source.
	 * @property {Boolean} autoRefresh
	 * @default true
	 */
	autoRefresh: {
		value:        true,
		configurable: true,
		writable:     true,
	},
	
	/**
	 * Before rendering, set active pane-item to instance if not visible.
	 * @property {Boolean} autoFocus
	 * @default true
	 */
	autoFocus: {
		value:        true,
		configurable: true,
		writable:     true,
	},
	
	/**
	 * Whether a render operation is queued, processing, or finished.
	 * @property {String} renderState
	 * @default ""
	 */
	renderState: {
		value:        "",
		configurable: true,
		writable:     true,
	},
});

module.exports = AtomLiveView;
