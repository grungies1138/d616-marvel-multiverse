/**
 * A player-facing "pick, pan, zoom, crop" dialog for the character portrait
 * (the hexagonal image in the sheet header).
 *
 * Unlike the system's other popups (Rest & Recover, Award Karma, Falling
 * Damage — see actor-sheet.mjs), this needs real interactive state: a canvas
 * the player drags/zooms on, a "pick a source" step before that, and a
 * network upload on save. That's more than `DialogV2.prompt`'s single
 * content-block-plus-OK-callback model comfortably handles, so it's built as
 * its own small ApplicationV2, following the same
 * HandlebarsApplicationMixin/actions pattern as D616CharacterSheet.
 *
 * The crop is locked to the portrait box's aspect ratio (13:15 — the ratio
 * behind every size the box has shipped at: 130x150, 143x165, 172x198) so
 * whatever comes out always fills the hexagonal frame with no gaps or
 * stretching. The visible canvas viewport *is* the crop: the image is drawn
 * onto it at "cover" scale or greater (never smaller, so it can never leave
 * a gap), and dragging/zooming just moves that image around underneath a
 * fixed frame — there's no separate movable crop rectangle to manage.
 */

import { applySheetTheme } from "../helpers/theme.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Portrait box aspect ratio (width / height). Keep in sync with the
 *  `.d616-cropper-canvas-wrap` size in styles/d616.css. */
const CROP_RATIO = 13 / 15;

/** On-screen crop viewport size, in CSS pixels. */
const VIEW_W = 338;
const VIEW_H = Math.round(VIEW_W / CROP_RATIO); // 390

/** Output raster size — oversampled so the saved portrait stays crisp even
 *  zoomed in on a high-DPI display. */
const OUT_W = VIEW_W * 3;
const OUT_H = VIEW_H * 3;

const MAX_ZOOM = 4;

/** Turns an actor name into a safe, readable filename fragment. */
function sanitizeForFilename(name) {
  const slug = (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "portrait";
}

export default class D616ImageCropper extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {Actor} document  The actor whose `img` this dialog will update.
   */
  constructor(document, options = {}) {
    super(options);
    this.doc = document;
    /** @type {HTMLImageElement|null} */
    this.image = null;
    this.imageLabel = null;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this._drag = null;
    this._objectUrl = null;
  }

  get title() {
    return game.i18n.localize("D616.ImageCropper.Title");
  }

  static DEFAULT_OPTIONS = {
    id: "d616-image-cropper-{id}",
    classes: ["d616", "sheet", "image-cropper"],
    window: { title: "", icon: "fa-solid fa-crop-simple", resizable: false },
    position: { width: 420 },
    actions: {
      pickUpload: D616ImageCropper.#onPickUpload,
      pickExisting: D616ImageCropper.#onPickExisting,
      changeImage: D616ImageCropper.#onChangeImage,
      reset: D616ImageCropper.#onReset,
      cancel: D616ImageCropper.#onCancel,
      save: D616ImageCropper.#onSave
    }
  };

  static PARTS = {
    body: { template: "systems/d616/templates/apps/image-cropper.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.hasImage = !!this.image;
    context.viewW = VIEW_W;
    context.viewH = VIEW_H;
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    applySheetTheme(this);

    const root = this.element;
    this.canvas = root.querySelector(".d616-crop-canvas");
    this.zoomSlider = root.querySelector(".d616-crop-zoom");

    const fileInput = root.querySelector(".d616-cropper-file-input");
    fileInput?.addEventListener("change", (event) => this._onFileSelected(event));

    this._bindDropZone(root.querySelector(".d616-cropper-picker"));
    this._bindDropZone(root.querySelector(".d616-cropper-canvas-wrap"));

    if (this.canvas) {
      this._bindCanvasEvents();
      if (this.image) this._draw();
    }

    this.zoomSlider?.addEventListener("input", (event) => {
      this._setZoom(Number(event.target.value));
    });
  }

  async close(options) {
    if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
    return super.close(options);
  }

  /* -------------------------------------------- */
  /*  Source picking                               */
  /* -------------------------------------------- */

  _bindDropZone(el) {
    if (!el) return;
    el.addEventListener("dragover", (event) => {
      event.preventDefault();
      el.classList.add("-dragover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("-dragover"));
    el.addEventListener("drop", (event) => {
      event.preventDefault();
      el.classList.remove("-dragover");
      const file = event.dataTransfer?.files?.[0];
      if (file) this._loadFile(file);
    });
  }

  _onFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) this._loadFile(file);
  }

  async _loadFile(file) {
    if (!file.type?.startsWith("image/")) {
      ui.notifications.warn(game.i18n.localize("D616.ImageCropper.NotAnImage"));
      return;
    }
    if (this._objectUrl) URL.revokeObjectURL(this._objectUrl);
    this._objectUrl = URL.createObjectURL(file);
    await this._loadImage(this._objectUrl, file.name);
  }

  async _loadImage(src, label) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const loaded = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
    });
    img.src = src;
    try {
      await loaded;
    } catch (err) {
      console.error("d616 | ImageCropper failed to load image", label, err);
      ui.notifications.error(game.i18n.format("D616.ImageCropper.LoadError", { name: label }));
      return;
    }
    this.image = img;
    this.imageLabel = label;
    this._centerImage();
    await this.render();
  }

  static #onPickUpload() {
    this.element.querySelector(".d616-cropper-file-input")?.click();
  }

  static #onPickExisting() {
    const FP = foundry.applications?.apps?.FilePicker ?? FilePicker;
    new FP({
      type: "image",
      current: this.doc.img,
      callback: (path) => this._loadImage(path, path)
    }).browse();
  }

  static #onChangeImage() {
    this.image = null;
    this.render();
  }

  /* -------------------------------------------- */
  /*  Pan / zoom                                   */
  /* -------------------------------------------- */

  _baseScale() {
    return Math.max(VIEW_W / this.image.naturalWidth, VIEW_H / this.image.naturalHeight);
  }

  _centerImage() {
    this.zoom = 1;
    const scale = this._baseScale();
    this.offsetX = (VIEW_W - this.image.naturalWidth * scale) / 2;
    this.offsetY = (VIEW_H - this.image.naturalHeight * scale) / 2;
  }

  /** Clamp so the image always fully covers the crop viewport, then redraw. */
  _setOffset(x, y) {
    const scale = this._baseScale() * this.zoom;
    const w = this.image.naturalWidth * scale;
    const h = this.image.naturalHeight * scale;
    const minX = VIEW_W - w;
    const minY = VIEW_H - h;
    this.offsetX = Math.min(0, Math.max(minX, x));
    this.offsetY = Math.min(0, Math.max(minY, y));
    this._draw();
  }

  /** Zoom to `newZoom`, keeping the point under (clientX, clientY) — or the
   *  viewport center, if not given — visually stable. */
  _setZoom(newZoom, cursor) {
    if (!this.image) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(1, newZoom));
    const baseScale = this._baseScale();
    const oldScale = baseScale * this.zoom;
    const newScale = baseScale * clamped;

    const rect = this.canvas.getBoundingClientRect();
    const px = cursor ? cursor.clientX - rect.left : VIEW_W / 2;
    const py = cursor ? cursor.clientY - rect.top : VIEW_H / 2;
    const imgX = (px - this.offsetX) / oldScale;
    const imgY = (py - this.offsetY) / oldScale;

    this.zoom = clamped;
    this._setOffset(px - imgX * newScale, py - imgY * newScale);
    if (this.zoomSlider) this.zoomSlider.value = String(clamped);
  }

  _bindCanvasEvents() {
    const canvas = this.canvas;
    canvas.addEventListener("pointerdown", (event) => {
      if (!this.image) return;
      canvas.setPointerCapture(event.pointerId);
      this._drag = { startX: event.clientX, startY: event.clientY, startOffX: this.offsetX, startOffY: this.offsetY };
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!this._drag) return;
      this._setOffset(
        this._drag.startOffX + (event.clientX - this._drag.startX),
        this._drag.startOffY + (event.clientY - this._drag.startY)
      );
    });
    const endDrag = () => { this._drag = null; };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", endDrag);
    canvas.addEventListener("wheel", (event) => {
      if (!this.image) return;
      event.preventDefault();
      this._setZoom(this.zoom + (event.deltaY < 0 ? 0.12 : -0.12), event);
    }, { passive: false });
  }

  _draw() {
    if (!this.canvas || !this.image) return;
    const ctx = this.canvas.getContext("2d");
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    const scale = this._baseScale() * this.zoom;
    ctx.drawImage(
      this.image,
      this.offsetX, this.offsetY,
      this.image.naturalWidth * scale, this.image.naturalHeight * scale
    );
  }

  static #onReset() {
    if (!this.image) return;
    this._centerImage();
    this._draw();
    if (this.zoomSlider) this.zoomSlider.value = "1";
  }

  /* -------------------------------------------- */
  /*  Save                                         */
  /* -------------------------------------------- */

  /** Renders the current crop onto an oversampled offscreen canvas and
   *  returns it as a PNG Blob. */
  async _exportBlob() {
    const k = OUT_W / VIEW_W;
    const off = document.createElement("canvas");
    off.width = OUT_W;
    off.height = OUT_H;
    const ctx = off.getContext("2d");
    const scale = this._baseScale() * this.zoom * k;
    ctx.drawImage(
      this.image,
      this.offsetX * k, this.offsetY * k,
      this.image.naturalWidth * scale, this.image.naturalHeight * scale
    );
    return new Promise((resolve, reject) => {
      off.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))), "image/png");
    });
  }

  static #onCancel() {
    this.close();
  }

  static async #onSave() {
    if (!this.image) {
      ui.notifications.warn(game.i18n.localize("D616.ImageCropper.NoImage"));
      return;
    }
    if (!(this.doc.isOwner || game.user.isGM)) {
      ui.notifications.error(game.i18n.localize("D616.ImageCropper.NoPermission"));
      return;
    }

    const saveBtn = this.element.querySelector('[data-action="save"]');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const blob = await this._exportBlob();
      const filename = `${sanitizeForFilename(this.doc.name)}-${Date.now()}.png`;
      const dir = `worlds/${game.world.id}/assets/portraits`;
      const FP = foundry.applications?.apps?.FilePicker ?? FilePicker;

      // Best-effort — throws if it already exists on some Foundry versions;
      // either way, if it's missing after this, the upload below will fail
      // with its own clear error.
      try { await FP.createDirectory("data", dir); } catch (_err) { /* likely already exists */ }

      const file = new File([blob], filename, { type: "image/png" });
      const response = await FP.upload("data", dir, file, {}, { notify: false });
      if (!response?.path) throw new Error("FilePicker.upload did not return a path");

      await this.doc.update({ img: response.path });
      ui.notifications.info(game.i18n.format("D616.ImageCropper.Saved", { name: this.doc.name }));
      this.close();
    } catch (err) {
      console.error("d616 | ImageCropper save failed", err);
      ui.notifications.error(game.i18n.localize("D616.ImageCropper.UploadError"));
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }
}
