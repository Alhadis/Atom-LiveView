"use strict";

module.exports = {
	
	/**
	 * Return the first {@link TextEditor} whose ID matches the given string.
	 *
	 * @param {String} id
	 * @return {?TextEditor}
	 * @internal
	 */
	editorForId(id){
		id = String(id);
		for(const editor of atom.workspace.getTextEditors())
			if(id === String(editor.id)) return editor;
		return null;
	},
	
	
	/**
	 * Determine if the subject item (like a {@link TextEditor} is being
	 * displayed by a visible {@link Pane} container.
	 *
	 * @param {Object} item
	 * @return {Boolean}
	 * @public
	 */
	isItemVisible(item){
		if(!item || !item.element) return false;
		for(const pane of atom.workspace.getVisiblePanes())
			if(pane.alive && item === pane.activeItem)
				return true;
		return false;
	},
	
	
	/**
	 * Return the first {@link TabView} whose item matches the given object.
	 *
	 * @param {Object} subject
	 * @return {?TabView}
	 * @public
	 */
	tabForItem(subject){
		const pkg = atom.packages.getActivePackage("tabs");
		if(pkg && "object" === typeof pkg.mainModule)
			for(const container of pkg.mainModule.tabBarViews)
				for(const tab of container.tabs)
					if(tab && subject === tab.item)
						return tab;
		return null;
	},
};
