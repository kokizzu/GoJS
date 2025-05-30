/*
 *  Copyright 1998-2025 by Northwoods Software Corporation. All Rights Reserved.
 */
/*
 * This is an extension and not part of the main GoJS library.
 * The source code for this is at extensionsJSM/LocalStorageCommandHandler.ts.
 * Note that the API for this class may change with any version, even point releases.
 * If you intend to use an extension in production, you should copy the code to your own source directory.
 * Extensions can be found in the GoJS kit under the extensions or extensionsJSM folders.
 * See the Extensions intro page (https://gojs.net/latest/intro/extensions.html) for more information.
 */
import * as go from 'gojs';
/**
 * This CommandHandler class uses localStorage as the repository for the clipboard,
 * rather than an in-memory global variable.
 * It requires that the {@link go.Diagram.model} be serializable and deserializable using {@link go.Model.toJson} and {@link go.Model.fromJson}.
 *
 * The {@link copyToClipboard} and {@link pasteFromClipboard} functions fall back to using the standard definitions
 * if there are any errors calling `Storage.getItem` or `Storage.setItem`.
 *
 * Typical usage:
 * ```js
 *   new go.Diagram("myDiagramDiv",
 *     {
 *       commandHandler: new LocalStorageCommandHandler(),
 *       ...
 *     }
 *   )
 * ```
 * or:
 * ```js
 *   myDiagram.commandHandler = new LocalStorageCommandHandler();
 * ```
 *
 * If you want to experiment with this extension, try the <a href="../../samples/LocalStorageCommandHandler.html">Local Storage Commands</a> sample.
 * @category Extension
 */
export class LocalStorageCommandHandler extends go.CommandHandler {
    constructor(init) {
        super();
        this.StorageKey = 'go._clipboard';
        this.FormatKey = 'go._clipboardFormat';
        if (init)
            Object.assign(this, init);
    }
    /**
     * Makes a copy of the given collection of {@link go.Part}s
     * and stores it as JSON in LocalStorage.
     * @param coll - a collection of {@link go.Part}s.
     */
    copyToClipboard(coll) {
        try {
            if (coll === null) {
                window.localStorage.setItem(this.StorageKey, '');
                window.localStorage.setItem(this.FormatKey, '');
            }
            else {
                const clipdiag = new go.Diagram(); // create a temporary Diagram
                // copy from this diagram to the temporary diagram some properties that affects copying:
                clipdiag.isTreePathToChildren = this.diagram.isTreePathToChildren;
                clipdiag.toolManager.draggingTool.dragsLink =
                    this.diagram.toolManager.draggingTool.dragsLink;
                // create a model like this one but with no data
                clipdiag.model = this.diagram.model.copy();
                // copy the given Parts into this temporary Diagram
                this.diagram.copyParts(coll, clipdiag, false);
                window.localStorage.setItem(this.StorageKey, clipdiag.model.toJson());
                window.localStorage.setItem(this.FormatKey, clipdiag.model.dataFormat);
            }
            this.diagram.raiseDiagramEvent('ClipboardChanged', coll);
        }
        catch (ex) {
            // fallback implementation
            super.copyToClipboard(coll);
        }
    }
    /**
     * If LocalStorage holds JSON for a collection of {@link go.Part}s,
     * and if the {@link go.Model.dataFormat} matches that stored in the clipboard,
     * this makes a copy of the clipboard's parts and adds the copies to this {@link go.Diagram}.
     * @returns a collection of newly pasted {@link go.Part}s
     */
    pasteFromClipboard() {
        const coll = new go.Set();
        try {
            const clipstr = window.localStorage.getItem(this.StorageKey);
            const clipfrmt = window.localStorage.getItem(this.FormatKey);
            if (clipstr === null || clipstr === '' || clipfrmt !== this.diagram.model.dataFormat) {
                return coll;
            }
            else {
                const clipdiag = new go.Diagram(); // create a temporary Diagram
                // recover the model from the clipboard rendering
                clipdiag.model = go.Model.fromJson(clipstr);
                // copy all the CLIPDIAG Parts into this Diagram
                const allparts = new go.Set();
                allparts.addAll(clipdiag.parts).addAll(clipdiag.nodes).addAll(clipdiag.links);
                const copymap = this.diagram.copyParts(allparts, this.diagram, false);
                // return a Set of the copied Parts
                return new go.Set().addAll(copymap.iteratorValues);
            }
        }
        catch (ex) {
            // fallback implementation
            return super.pasteFromClipboard();
        }
    }
    /**
     * This predicate controls whether or not the user can invoke the {@link pasteSelection} command.
     *
     * This works just like {@link go.CommandHandler.canPasteSelection}, but looks at LocalStorage instead of a static variable.
     */
    canPasteSelection(pos) {
        const diagram = this.diagram;
        if (diagram.isReadOnly || diagram.isModelReadOnly)
            return false;
        if (!diagram.allowInsert || !diagram.allowClipboard)
            return false;
        try {
            const clipstr = window.localStorage.getItem(this.StorageKey);
            const clipfrmt = window.localStorage.getItem(this.FormatKey);
            if (clipstr === null || clipstr === '')
                return false;
            if (clipfrmt !== diagram.model.dataFormat)
                return false;
            return true;
        }
        catch (ex) {
            // fallback implementation
            return super.canPasteSelection(pos);
        }
    }
}
