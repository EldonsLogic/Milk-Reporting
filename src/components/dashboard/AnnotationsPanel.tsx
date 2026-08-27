"use client";

import React, { useState } from "react";
import {
  Annotation,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from "@/lib/supabase-data";
import { getErrorMessage } from "@/lib/errors";
import { toDateStr } from "@/lib/query-engine";
import { X, Trash2, Plus, Pencil } from "lucide-react";

interface Props {
  clientId: string;
  annotations: Annotation[];
  onClose: () => void;
  onChanged: () => void;
}

// The agency's own vocabulary for what happened. Kept as a small fixed set
// so annotations stay filterable/colourable; the free-text title carries the
// specifics.
const CATEGORIES = [
  { value: "creative", label: "Creative" },
  { value: "budget", label: "Budget" },
  { value: "targeting", label: "Targeting" },
  { value: "landing_page", label: "Landing Page" },
  { value: "external", label: "External Event" },
  { value: "general", label: "General" },
];

export function AnnotationsPanel({ clientId, annotations, onClose, onChanged }: Props) {
  const [date, setDate] = useState(toDateStr(new Date()));
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("creative");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setNote("");
    setCategory("creative");
    setDate(toDateStr(new Date()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updateAnnotation(editingId, { date, title: title.trim(), note: note.trim(), category });
      } else {
        await createAnnotation({ clientId, date, title: title.trim(), note: note.trim() || undefined, category });
      }
      resetForm();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save annotation"));
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (annotation: Annotation) => {
    setEditingId(annotation.id);
    setDate(annotation.date);
    setTitle(annotation.title);
    setNote(annotation.note || "");
    setCategory(annotation.category);
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAnnotation(id);
      if (editingId === id) resetForm();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete annotation"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-black overflow-y-auto">
        <div className="p-6 pb-4 border-b border-black flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-display font-bold uppercase tracking-tight text-black">Annotations</h3>
            <p className="text-xs font-mono text-neutral-500 mt-0.5">
              Mark what changed on a given day. These appear as markers on time-series widgets, for you and
              for the client.
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 border border-transparent hover:border-black shrink-0">
            <X className="w-5 h-5 text-black" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3 text-xs font-mono border-b border-neutral-200">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
              />
            </div>
            <div>
              <label className="block font-bold uppercase text-neutral-800 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block font-bold uppercase text-neutral-800 mb-1">What happened</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New creative set live"
              className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm"
            />
          </div>
          <div>
            <label className="block font-bold uppercase text-neutral-800 mb-1">Detail (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Swapped all prospecting video for the Q3 cut."
              className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm resize-none"
            />
          </div>

          {error && <p className="text-red-600">{error}</p>}

          <div className="flex gap-2">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-1.5 border border-black font-bold hover:bg-neutral-100"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="submit"
              disabled={busy}
              className="flex-1 px-3 py-1.5 bg-milk-yellow text-black border border-black font-bold shadow-crisp-sm hover:bg-milk-yellowHover disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {editingId ? "Update Annotation" : "Add Annotation"}
            </button>
          </div>
        </form>

        <div className="p-6 flex-1">
          <h4 className="font-mono text-xs font-bold uppercase text-neutral-800 mb-3">
            Existing ({annotations.length})
          </h4>
          {annotations.length === 0 ? (
            <p className="font-mono text-xs text-neutral-500">
              Nothing recorded yet. Annotations are how a spike or drop carries the reason you already know.
            </p>
          ) : (
            <div className="space-y-2">
              {[...annotations]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((a) => (
                  <div key={a.id} className="border border-neutral-200 p-2.5 hover:border-black group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] text-neutral-500 uppercase flex items-center gap-1.5">
                          {a.date}
                          <span className="px-1 py-0.5 bg-neutral-100 border border-neutral-200">{a.category}</span>
                        </div>
                        <div className="font-sans font-semibold text-sm text-neutral-900 leading-tight mt-0.5">
                          {a.title}
                        </div>
                        {a.note && <div className="font-sans text-xs text-neutral-600 mt-0.5">{a.note}</div>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(a)}
                          title="Edit annotation"
                          className="p-1 text-neutral-500 hover:text-black"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(a.id)}
                          title="Delete annotation"
                          className="p-1 text-neutral-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
