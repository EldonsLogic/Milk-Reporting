"use client";

import React, { useState } from "react";
import { Layout, Responsive, WidthProvider } from "react-grid-layout";
import {
  Dashboard,
  WidgetConfig,
  RawDailyRecord,
  ContentPost,
  DateRangePreset,
  WidgetType,
  DashboardPage,
} from "@/types";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { WidgetConfigDrawer } from "@/components/dashboard/WidgetConfigDrawer";
import {
  Plus,
  Edit3,
  Check,
  Copy,
  Save,
  Calendar,
  Layers,
  Sparkles,
  Printer,
  Settings,
} from "lucide-react";

// Responsive grid: reflows columns per breakpoint (12 on desktop down to a
// single column on phones) instead of always rendering 12 fixed columns.
const ReactGridLayout = WidthProvider(Responsive);
const GRID_BREAKPOINTS = { lg: 1024, md: 768, sm: 640, xs: 0 };
const GRID_COLS = { lg: 12, md: 8, sm: 4, xs: 1 };

interface Props {
  dashboard: Dashboard;
  records: RawDailyRecord[];
  contentPosts?: ContentPost[];
  onSaveDashboard: (updatedDashboard: Dashboard) => void;
  onDuplicateDashboard: (dashboard: Dashboard) => void;
  userRole?: "agency_admin" | "client_viewer";
}

export function DashboardBuilder({
  dashboard,
  records,
  contentPosts = [],
  onSaveDashboard,
  onDuplicateDashboard,
  userRole = "agency_admin",
}: Props) {
  const [currentDashboard, setCurrentDashboard] = useState<Dashboard>(dashboard);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [globalDateRange, setGlobalDateRange] = useState<DateRangePreset>(
    dashboard.globalDateRange || "last_30_days"
  );
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);
  // null = Add Widget modal closed; undefined = adding to the ungrouped
  // area; a string = adding into that section's id
  const [addWidgetTargetSection, setAddWidgetTargetSection] = useState<string | undefined | null>(null);
  const [activeBreakpoint, setActiveBreakpoint] = useState<string>("lg");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [markupInput, setMarkupInput] = useState<string>(String(dashboard.markupPercentage ?? 0));

  // Client perspective is driven by userRole (the same "Client Portal View"
  // toggle in AgencyShell agency admins use to preview) - markup is only
  // ever applied here, never for the agency's own admin view.
  const isClientPerspective = userRole === "client_viewer";

  const activePage: DashboardPage =
    currentDashboard.pages[activePageIndex] || currentDashboard.pages[0];

  // Widgets group into an "ungrouped" area plus any agency-defined
  // sections; a page with no sections behaves exactly as before (one flat
  // grid, no headers) so existing dashboards/templates are unaffected.
  const sections = (activePage.sections || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const ungroupedWidgets = activePage.widgets.filter(
    (w) => !w.sectionId || !sections.some((s) => s.id === w.sectionId)
  );

  // Handle grid layout drag/resize changes. Widgets store a single GridPos
  // (not one per breakpoint), so it's the source of truth for the "lg"
  // (desktop) layout only - smaller breakpoints are RGL's auto-reflowed
  // preview and shouldn't be written back, or resizing on a phone would
  // overwrite the real desktop positions.
  const handleLayoutChange = (newLayout: Layout[]) => {
    if (!isEditMode || activeBreakpoint !== "lg") return;

    const updatedWidgets = activePage.widgets.map((w) => {
      const match = newLayout.find((l) => l.i === w.id);
      if (match) {
        return {
          ...w,
          grid: {
            x: match.x,
            y: match.y,
            w: match.w,
            h: match.h,
          },
        };
      }
      return w;
    });

    updateActivePageWidgets(updatedWidgets);
  };

  const updateActivePageWidgets = (widgets: WidgetConfig[]) => {
    const updatedPages = [...currentDashboard.pages];
    updatedPages[activePageIndex] = {
      ...activePage,
      widgets,
    };

    const updatedDash = {
      ...currentDashboard,
      pages: updatedPages,
      updatedAt: new Date().toISOString(),
    };

    setCurrentDashboard(updatedDash);
  };

  const handleAddWidget = (type: WidgetType) => {
    const sectionId = addWidgetTargetSection ?? undefined;
    const siblingWidgets = activePage.widgets.filter((w) => w.sectionId === sectionId);
    const newWidget: WidgetConfig = {
      id: `w-${Date.now()}`,
      pageId: activePage.id,
      sectionId,
      widgetType: type,
      title: `New ${type.toUpperCase().replace("_", " ")}`,
      grid: {
        x: (siblingWidgets.length * 3) % 12,
        y: Infinity, // Placed at bottom automatically
        w: type === "kpi_card" ? 3 : type === "content_table" ? 8 : type === "line_chart" || type === "area_chart" ? 6 : 4,
        h: type === "kpi_card" ? 3 : type === "content_table" ? 6 : 4,
      },
      dataConfig: {
        platform: "all",
        metricIds: type === "kpi_card" ? ["reach"] : ["reach", "impressions"],
      },
    };

    updateActivePageWidgets([...activePage.widgets, newWidget]);
    setAddWidgetTargetSection(null);
    setEditingWidget(newWidget);
  };

  const handleDeleteWidget = (widgetId: string) => {
    const filtered = activePage.widgets.filter((w) => w.id !== widgetId);
    updateActivePageWidgets(filtered);
  };

  const handleSaveWidgetConfig = (updatedWidget: WidgetConfig) => {
    const updated = activePage.widgets.map((w) =>
      w.id === updatedWidget.id ? updatedWidget : w
    );
    updateActivePageWidgets(updated);
  };

  const handleAddPage = () => {
    const newPageTitle = prompt("Enter new dashboard page title:", "New Section");
    if (!newPageTitle) return;

    const newPage: DashboardPage = {
      id: `p-${Date.now()}`,
      dashboardId: currentDashboard.id,
      title: newPageTitle,
      sortOrder: currentDashboard.pages.length,
      widgets: [],
    };

    const updatedDash = {
      ...currentDashboard,
      pages: [...currentDashboard.pages, newPage],
    };
    setCurrentDashboard(updatedDash);
    setActivePageIndex(currentDashboard.pages.length);
  };

  const handleAddSection = () => {
    const title = prompt("Section title?", "New Section");
    if (!title) return;
    const newSection = { id: `sec-${Date.now()}`, title, sortOrder: (activePage.sections || []).length };
    const updatedPages = [...currentDashboard.pages];
    updatedPages[activePageIndex] = { ...activePage, sections: [...(activePage.sections || []), newSection] };
    setCurrentDashboard({ ...currentDashboard, pages: updatedPages, updatedAt: new Date().toISOString() });
  };

  const handleRenameSection = (sectionId: string) => {
    const section = (activePage.sections || []).find((s) => s.id === sectionId);
    if (!section) return;
    const title = prompt("Rename section:", section.title);
    if (!title) return;
    const updatedSections = (activePage.sections || []).map((s) => (s.id === sectionId ? { ...s, title } : s));
    const updatedPages = [...currentDashboard.pages];
    updatedPages[activePageIndex] = { ...activePage, sections: updatedSections };
    setCurrentDashboard({ ...currentDashboard, pages: updatedPages, updatedAt: new Date().toISOString() });
  };

  const handleDeleteSection = (sectionId: string) => {
    if (!confirm("Delete this section? Its widgets move to the ungrouped area, not deleted.")) return;
    const updatedSections = (activePage.sections || []).filter((s) => s.id !== sectionId);
    const updatedWidgets = activePage.widgets.map((w) => (w.sectionId === sectionId ? { ...w, sectionId: undefined } : w));
    const updatedPages = [...currentDashboard.pages];
    updatedPages[activePageIndex] = { ...activePage, sections: updatedSections, widgets: updatedWidgets };
    setCurrentDashboard({ ...currentDashboard, pages: updatedPages, updatedAt: new Date().toISOString() });
  };

  const handleSaveMarkup = () => {
    const parsed = Number(markupInput);
    const markupPercentage = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    const updatedDash = { ...currentDashboard, markupPercentage, updatedAt: new Date().toISOString() };
    setCurrentDashboard(updatedDash);
    onSaveDashboard(updatedDash);
    setIsSettingsOpen(false);
  };

  // Renders one grid instance for a subset of the active page's widgets
  // (either the ungrouped area or a single section) - handleLayoutChange
  // already only updates widgets present in whatever layout array it's
  // given, so the same handler is safe to reuse across multiple instances.
  const renderGrid = (widgets: WidgetConfig[]) => {
    const gridLayout: Layout[] = widgets.map((w) => ({
      i: w.id,
      x: w.grid.x,
      y: w.grid.y,
      w: w.grid.w,
      h: w.grid.h,
      minW: 2,
      minH: 2,
    }));

    return (
      <ReactGridLayout
        className="layout"
        layouts={{ lg: gridLayout, md: gridLayout, sm: gridLayout, xs: gridLayout }}
        breakpoints={GRID_BREAKPOINTS}
        cols={GRID_COLS}
        rowHeight={60}
        isDraggable={isEditMode}
        isResizable={isEditMode}
        onLayoutChange={handleLayoutChange}
        onBreakpointChange={setActiveBreakpoint}
        margin={[16, 16]}
        draggableCancel=".no-drag"
      >
        {widgets.map((widget) => (
          <div key={widget.id}>
            <WidgetRenderer
              widget={widget}
              records={records}
              contentPosts={contentPosts}
              globalDateRange={globalDateRange}
              isEditMode={isEditMode}
              markupPercentage={isClientPerspective ? currentDashboard.markupPercentage : undefined}
              onEdit={(w) => setEditingWidget(w)}
              onDelete={(id) => handleDeleteWidget(id)}
            />
          </div>
        ))}
      </ReactGridLayout>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-milk-bg">
      {/* Top Builder Control Bar */}
      <div className="bg-white border-b border-black px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 shadow-xs">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-xl font-display font-black tracking-tight text-black flex items-center gap-2">
              {currentDashboard.title}
            </h1>
            <p className="text-xs font-mono text-neutral-500">
              Client Dashboard • {activePage.widgets.length} Widgets
            </p>
          </div>

          {/* Dashboard Page Tabs */}
          <div className="flex items-center space-x-1 border-l border-neutral-200 pl-4">
            {currentDashboard.pages.map((page, idx) => (
              <button
                key={page.id}
                onClick={() => setActivePageIndex(idx)}
                className={`px-3 py-1 text-xs font-mono font-bold transition-all border ${
                  activePageIndex === idx
                    ? "bg-milk-yellow text-black border-black shadow-crisp-sm"
                    : "bg-white text-neutral-600 border-neutral-300 hover:border-black"
                }`}
              >
                {page.title}
              </button>
            ))}
            {isEditMode && (
              <button
                onClick={handleAddPage}
                className="px-2 py-1 text-xs font-mono bg-neutral-100 hover:bg-neutral-200 border border-neutral-300 font-bold"
                title="Add Page Tab"
              >
                + Tab
              </button>
            )}
          </div>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex items-center space-x-3 text-xs font-mono">
          {/* Global Date Range Selector */}
          <div className="flex items-center space-x-1 bg-white border border-black px-2 py-1">
            <Calendar className="w-3.5 h-3.5 text-neutral-700" />
            <select
              value={globalDateRange}
              onChange={(e) => setGlobalDateRange(e.target.value as DateRangePreset)}
              className="bg-transparent focus:outline-none font-bold text-black cursor-pointer"
            >
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_14_days">Last 14 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="last_90_days">Last 90 Days</option>
              <option value="this_month">This Month</option>
              <option value="previous_month">Previous Month</option>
            </select>
          </div>

          {/* Export PDF Report */}
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 font-bold bg-white text-black border border-black hover:bg-neutral-100 flex items-center space-x-1"
            title="Export / Print Report PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>

          {/* Agency Admin Only Controls */}
          {userRole === "agency_admin" && (
            <>
              {/* Edit Mode Toggle */}
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`px-3 py-1.5 font-bold flex items-center space-x-1.5 border transition-all ${
                  isEditMode
                    ? "bg-black text-white border-black"
                    : "bg-white text-black border-black hover:bg-milk-subtle"
                }`}
              >
                {isEditMode ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-milk-yellow" />
                    <span>Exit Edit Mode</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-3.5 h-3.5 text-black" />
                    <span>Edit Dashboard</span>
                  </>
                )}
              </button>

              {/* Add Widget (Active only in Edit Mode) */}
              {isEditMode && (
                <button
                  onClick={() => setAddWidgetTargetSection(undefined)}
                  className="px-3 py-1.5 font-bold bg-milk-yellow text-black border border-black hover:bg-milk-yellowHover flex items-center space-x-1 shadow-crisp-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Widget</span>
                </button>
              )}

              {/* Dashboard Settings (markup, etc.) */}
              <button
                onClick={() => {
                  setMarkupInput(String(currentDashboard.markupPercentage ?? 0));
                  setIsSettingsOpen(true);
                }}
                className="px-2.5 py-1.5 font-bold bg-white text-neutral-700 border border-neutral-300 hover:border-black flex items-center space-x-1"
                title="Dashboard Settings"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>

              {/* Duplicate Dashboard */}
              <button
                onClick={() => onDuplicateDashboard(currentDashboard)}
                className="px-2.5 py-1.5 font-bold bg-white text-neutral-700 border border-neutral-300 hover:border-black flex items-center space-x-1"
                title="Duplicate Dashboard"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Duplicate</span>
              </button>

              {/* Save Dashboard Layout */}
              <button
                onClick={() => onSaveDashboard(currentDashboard)}
                className="px-3 py-1.5 font-bold bg-black text-milk-yellow border border-black hover:bg-neutral-900 flex items-center space-x-1 shadow-crisp-sm"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Grid Canvas */}
      <div className="flex-1 p-6">
        {activePage.widgets.length === 0 && sections.length === 0 ? (
          <div className="border-2 dashed border-neutral-300 p-12 text-center my-12 max-w-lg mx-auto bg-white">
            <Layers className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
            <h3 className="text-sm font-mono font-bold uppercase text-black">Empty Dashboard Section</h3>
            <p className="text-xs font-sans text-neutral-500 mt-1 mb-4">
              Click &quot;Edit Dashboard&quot; and add widgets to customize this client layout.
            </p>
            <button
              onClick={() => {
                setIsEditMode(true);
                setAddWidgetTargetSection(undefined);
              }}
              className="px-4 py-2 bg-milk-yellow text-black border border-black font-mono text-xs font-bold shadow-crisp-sm"
            >
              + Add First Widget
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {ungroupedWidgets.length > 0 && renderGrid(ungroupedWidgets)}

            {sections.map((section) => {
              const sectionWidgets = activePage.widgets.filter((w) => w.sectionId === section.id);
              return (
                <div key={section.id}>
                  <div className="flex items-center justify-between border-b-2 border-black pb-1.5 mb-4">
                    <h2 className="text-sm font-display font-black uppercase tracking-wide text-black">
                      {section.title}
                    </h2>
                    {isEditMode && (
                      <div className="flex items-center gap-3 text-xs font-mono">
                        <button
                          onClick={() => setAddWidgetTargetSection(section.id)}
                          className="text-neutral-600 hover:text-black font-bold"
                        >
                          + Add Widget
                        </button>
                        <button
                          onClick={() => handleRenameSection(section.id)}
                          className="text-neutral-600 hover:text-black font-bold"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => handleDeleteSection(section.id)}
                          className="text-red-600 hover:text-red-800 font-bold"
                        >
                          Delete Section
                        </button>
                      </div>
                    )}
                  </div>
                  {sectionWidgets.length > 0 ? (
                    renderGrid(sectionWidgets)
                  ) : (
                    <p className="text-xs font-mono text-neutral-400 mb-4">No widgets in this section yet.</p>
                  )}
                </div>
              );
            })}

            {isEditMode && (
              <button
                onClick={handleAddSection}
                className="px-3 py-1.5 text-xs font-mono font-bold border border-neutral-300 bg-white hover:border-black flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Section
              </button>
            )}
          </div>
        )}
      </div>

      {/* Widget Configuration Modal Drawer */}
      {editingWidget && (
        <WidgetConfigDrawer
          widget={editingWidget}
          isOpen={!!editingWidget}
          onClose={() => setEditingWidget(null)}
          onSave={handleSaveWidgetConfig}
        />
      )}

      {/* Dashboard Settings Modal (markup) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white border-2 border-black max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-lg font-display font-extrabold uppercase text-black mb-1">Dashboard Settings</h3>
            <p className="text-xs font-mono text-neutral-500 mb-4">Applies only to this dashboard.</p>

            <label className="block text-xs font-mono font-bold uppercase text-neutral-800 mb-1">
              Agency Markup (%)
            </label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={markupInput}
              onChange={(e) => setMarkupInput(e.target.value)}
              className="w-full p-2 border border-neutral-300 focus:border-black focus:outline-none bg-milk-bg font-sans text-sm font-semibold mb-1"
            />
            <p className="text-[11px] font-sans text-neutral-500 mb-6">
              Added on top of true spend for the client-facing view only (spend, CPM, CPC, CPA, ROAS, etc.).
              You always see true spend in your own admin view - use &quot;Client Portal View&quot; in the header
              to preview exactly what the client sees.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-1.5 border border-black font-mono text-xs font-bold hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMarkup}
                className="px-4 py-1.5 border border-black bg-black text-milk-yellow font-mono text-xs font-bold hover:bg-neutral-900"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Widget Picker Modal */}
      {addWidgetTargetSection !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white border-2 border-black max-w-lg w-full p-6 shadow-2xl">
            <h3 className="text-lg font-display font-extrabold uppercase text-black mb-1">Add Widget</h3>
            <p className="text-xs font-mono text-neutral-500 mb-4">Choose a visualization card to place on grid</p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-6">
              {[
                { type: "kpi_card", label: "KPI Card", desc: "Single big metric readout with delta" },
                { type: "line_chart", label: "Line Chart", desc: "Time-series trend line" },
                { type: "area_chart", label: "Area Chart", desc: "Shaded volume metric trend" },
                { type: "bar_chart", label: "Bar Chart", desc: "Comparative bar visualizer" },
                { type: "donut_chart", label: "Donut Share", desc: "Proportional metric breakdown" },
                { type: "table", label: "Data Table", desc: "Structured performance table" },
                { type: "content_table", label: "Content Post Grid", desc: "Per-post thumbnails with caption + engagement" },
                { type: "ai_insight", label: "AI Diagnostic", desc: "Fact -> Interpretation card" },
                { type: "text", label: "Text / Notes", desc: "Custom client annotation block" },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleAddWidget(item.type as WidgetType)}
                  className="p-3 border border-neutral-200 hover:border-black hover:bg-milk-yellow text-left transition-all group"
                >
                  <div className="font-bold text-black group-hover:underline">{item.label}</div>
                  <div className="text-[10px] text-neutral-500 font-sans mt-0.5">{item.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setAddWidgetTargetSection(null)}
                className="px-4 py-1.5 border border-black font-mono text-xs font-bold hover:bg-neutral-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
