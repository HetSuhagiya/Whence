"use client";

import * as React from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  api,
  CheckItem,
  ConnectionPublic,
  ConnectionTestResult,
  ModelPublic,
  TableDetail,
  TablePreviewResponse,
} from "@/lib/api";
import { StepIndicator, StepItem } from "@/components/navigation/StepIndicator";
import { CreateDashboardDialog } from "@/components/dashboard/CreateDashboardDialog";
import { SemanticLayerManager } from "@/components/semantic/SemanticLayerManager";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Database,
  Eye,
  FileText,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";

/**
 * Debounce hook: only activates loading UI if the wait exceeds delayMs (default 200ms).
 * Prevents skeleton flicker for near-instant or cached responses.
 */
function useDebouncedLoading(active: boolean, delayMs = 200): boolean {
  const [debounced, setDebounced] = React.useState(false);

  React.useEffect(() => {
    if (!active) {
      setDebounced(false);
      return;
    }
    const timer = setTimeout(() => {
      setDebounced(true);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return debounced;
}

export type CheckLiveState = "pending" | "running" | "passed" | "failed" | "skipped";

export interface LiveCheckDisplay {
  id: string;
  title: string;
  status: CheckLiveState;
  message: string;
  remediation?: string | null;
}

const DEFAULT_CHECKS: { id: string; title: string; defaultMsg: string }[] = [
  { id: "key_format", title: "Key file format", defaultMsg: "Validating service account JSON key..." },
  { id: "auth", title: "Authentication", defaultMsg: "Validating token acquisition with Google Cloud..." },
  { id: "job_user", title: "BigQuery Job User permission", defaultMsg: "Running dry-run query (SELECT 1) in billing project..." },
  { id: "list_datasets", title: "List datasets permission", defaultMsg: "Verifying dataset read permissions..." },
  { id: "read_schemas", title: "Read table schema (BigQuery Data Viewer)", defaultMsg: "Reading metadata schema for selected tables..." },
  { id: "detect_location", title: "Dataset location detection", defaultMsg: "Detecting dataset geographic processing location..." },
  { id: "byte_cap_check", title: "Dry-run query byte cap check", defaultMsg: "Enforcing 10.0 GB scan limit via dry run..." },
];

export default function DataConnectionsPage() {
  const [activeTab, setActiveTab] = React.useState<"connection" | "semantic">("connection");
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [connections, setConnections] = React.useState<ConnectionPublic[]>([]);
  const [currentConnection, setCurrentConnection] = React.useState<ConnectionPublic | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  // Screen Reader Live Announcements (aria-live)
  const [loadingAnnouncement, setLoadingAnnouncement] = React.useState<string>("");

  // Step 1: Connect Form State & Loaders
  const [connName, setConnName] = React.useState("BigQuery production");
  const [keyJson, setKeyJson] = React.useState<string>("");
  const [keyFileName, setKeyFileName] = React.useState<string | null>(null);
  const [keyFileSize, setKeyFileSize] = React.useState<number | null>(null);
  const [isUploadingKey, setIsUploadingKey] = React.useState(false);
  const [isUsingDemo, setIsUsingDemo] = React.useState(false);

  // Replace Key Dialog State
  const [isReplaceKeyOpen, setIsReplaceKeyOpen] = React.useState(false);
  const [replaceTargetConn, setReplaceTargetConn] = React.useState<ConnectionPublic | null>(null);
  const [replacementKeyJson, setReplacementKeyJson] = React.useState<string>("");
  const [replacementFileName, setReplacementFileName] = React.useState<string | null>(null);
  const [isReplacingKey, setIsReplacingKey] = React.useState(false);

  // Remove Connection State
  const [deletingConnId, setDeletingConnId] = React.useState<string | null>(null);

  // Step 2: Choose Data State & Loaders
  const [projects, setProjects] = React.useState<string[]>([]);
  const [billingProject, setBillingProject] = React.useState<string>("");
  const [browseProject, setBrowseProject] = React.useState<string>("");
  const [customProjectId, setCustomProjectId] = React.useState<string>("");
  const [isAddingProjectUI, setIsAddingProjectUI] = React.useState(false);
  const [isAddingProjectLoading, setIsAddingProjectLoading] = React.useState(false);

  const [metadataLoading, setMetadataLoading] = React.useState(false);
  const [datasets, setDatasets] = React.useState<{ dataset_id: string; location: string }[]>([]);
  const [selectedDataset, setSelectedDataset] = React.useState<string>("");
  const [detectedLocation, setDetectedLocation] = React.useState<string>("US");

  const [tablesLoading, setTablesLoading] = React.useState(false);
  const [tables, setTables] = React.useState<{ table_name: string; table_type: string }[]>([]);
  const [selectedTableNames, setSelectedTableNames] = React.useState<string[]>([]);

  const [detailLoading, setDetailLoading] = React.useState(false);
  const [tableDetails, setTableDetails] = React.useState<Record<string, TableDetail>>({});
  const [inspectingTable, setInspectingTable] = React.useState<string | null>(null);

  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [tablePreview, setTablePreview] = React.useState<TablePreviewResponse | null>(null);

  const [isSavingSources, setIsSavingSources] = React.useState(false);

  // Step 3: Test Connection State & Loaders
  const [testResult, setTestResult] = React.useState<ConnectionTestResult | null>(null);
  const [testingInProgress, setTestingInProgress] = React.useState(false);
  const [liveChecks, setLiveChecks] = React.useState<LiveCheckDisplay[]>([]);
  const [isSavingConnection, setIsSavingConnection] = React.useState(false);
  const [sourcesSaved, setSourcesSaved] = React.useState(false);

  // Workflow tracking across steps
  const [models, setModels] = React.useState<ModelPublic[]>([]);
  const [dashboardsCount, setDashboardsCount] = React.useState<number>(0);
  const [isCreateDashboardOpen, setIsCreateDashboardOpen] = React.useState(false);

  // Parse URL search params (?tab=model&connection_id=...)
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      const connId = params.get("connection_id");
      if (tab === "model" || tab === "semantic") {
        setActiveTab("semantic");
      } else if (tab === "connect" || tab === "connection") {
        setActiveTab("connection");
      }
      if (connId) {
        api
          .listConnections()
          .then((conns) => {
            const found = conns.find((c) => c.id === connId);
            if (found) setCurrentConnection(found);
          })
          .catch(() => {});
      }
    }
  }, []);

  // Load dashboards count for workflow step 4
  React.useEffect(() => {
    if (typeof api.listDashboards === "function") {
      api
        .listDashboards()
        .then((list) => setDashboardsCount(list.length))
        .catch(() => {});
    }
  }, []);

  // Load models for current connection to track step 3 confirmation
  React.useEffect(() => {
    if (currentConnection && typeof api.listModels === "function") {
      api
        .listModels(currentConnection.id)
        .then((m) => setModels(m))
        .catch(() => setModels([]));
    } else {
      setModels([]);
    }
  }, [currentConnection]);

  // Compute 4-step workflow indicator state
  const workflowSteps: StepItem[] = React.useMemo(() => {
    const hasConn = connections.length > 0;
    const hasTables =
      (currentConnection?.selected_tables_count || 0) > 0 ||
      selectedTableNames.length > 0 ||
      sourcesSaved;
    const hasModel = models.length > 0;
    const hasDashboards = dashboardsCount > 0;

    // Step 1: Connect
    let s1Status: StepItem["status"] = "current";
    let s1Reason = "Connect BigQuery or local DuckDB warehouse";
    if (hasConn) {
      s1Status = "done";
      s1Reason = `Connected: ${currentConnection?.name || "Warehouse"}`;
    }

    // Step 2: Choose data
    let s2Status: StepItem["status"] = "upcoming";
    let s2Reason = "Select warehouse tables";
    if (!hasConn) {
      s2Status = "blocked";
      s2Reason = "Connect a warehouse first";
    } else if (hasTables) {
      s2Status = "done";
      s2Reason = `${
        currentConnection?.selected_tables_count || selectedTableNames.length || "Configured"
      } tables selected`;
    } else if (activeTab === "connection" && step === 2) {
      s2Status = "current";
      s2Reason = "Select tables to query";
    }

    // Step 3: Model
    let s3Status: StepItem["status"] = "upcoming";
    let s3Reason = "Confirm semantic model";
    if (!hasConn) {
      s3Status = "blocked";
      s3Reason = "Connect a warehouse first";
    } else if (!hasTables) {
      s3Status = "blocked";
      s3Reason = "Select tables before defining a model";
    } else if (hasModel) {
      s3Status = "done";
      s3Reason = `Model confirmed (${models[0].name})`;
    } else if (activeTab === "semantic") {
      s3Status = "current";
      s3Reason = "Confirm metrics and dimensions";
    }

    // Step 4: Dashboard
    let s4Status: StepItem["status"] = "upcoming";
    let s4Reason = "Ready to build dashboard";
    if (!hasModel) {
      s4Status = "blocked";
      s4Reason = "Confirm a semantic model before building dashboards";
    } else if (hasDashboards) {
      s4Status = "done";
      s4Reason = `${dashboardsCount} dashboard${dashboardsCount === 1 ? "" : "s"} ready`;
    }

    return [
      { id: "connect", name: "Connect", status: s1Status, reason: s1Reason },
      { id: "choose_data", name: "Choose data", status: s2Status, reason: s2Reason },
      { id: "model", name: "Model", status: s3Status, reason: s3Reason },
      { id: "dashboard", name: "Dashboard", status: s4Status, reason: s4Reason },
    ];
  }, [
    connections.length,
    currentConnection,
    selectedTableNames.length,
    sourcesSaved,
    models,
    dashboardsCount,
    activeTab,
    step,
  ]);

  const handleStepClick = (stepId: string) => {
    if (stepId === "connect") {
      setActiveTab("connection");
      setStep(1);
    } else if (stepId === "choose_data") {
      setActiveTab("connection");
      if (currentConnection) initializeStep2(currentConnection);
      setStep(2);
    } else if (stepId === "model") {
      setActiveTab("semantic");
    } else if (stepId === "dashboard") {
      setIsCreateDashboardOpen(true);
    }
  };

  // Debounced Loading for Skeletons (no flash for waits < 200ms)
  const showMetadataSkeleton = useDebouncedLoading(metadataLoading, 200);
  const showTableSkeleton = useDebouncedLoading(tablesLoading, 200);
  const showDetailSkeleton = useDebouncedLoading(detailLoading, 200);
  const showPreviewSkeleton = useDebouncedLoading(previewLoading, 200);

  // Load existing connections on mount
  const loadConnections = React.useCallback(async () => {
    try {
      const list = await api.listConnections();
      setConnections(list);
      if (list.length > 0 && !currentConnection) {
        setCurrentConnection(list[0]);
      }
    } catch {
      // Backend may be initializing
    }
  }, [currentConnection]);

  React.useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Handle File Upload for Step 1
  const handleKeyFileUpload = (file: File) => {
    setErrorMessage(null);
    if (file.size > 65536) {
      setErrorMessage("Key file size exceeds 64 KB limit. Upload a standard service-account JSON key.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        if (parsed.type !== "service_account") {
          setErrorMessage("Key file must be a service_account key.");
          return;
        }
        setKeyJson(text);
        setKeyFileName(file.name);
        setKeyFileSize(file.size);
      } catch {
        setErrorMessage("File is not valid JSON.");
      }
    };
    reader.readAsText(file);
  };

  // Handle File Upload for Replace Key Dialog
  const handleReplacementKeyUpload = (file: File) => {
    setErrorMessage(null);
    if (file.size > 65536) {
      setErrorMessage("Key file size exceeds 64 KB limit.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        if (parsed.type !== "service_account") {
          setErrorMessage("Key file must be a service_account key.");
          return;
        }
        setReplacementKeyJson(text);
        setReplacementFileName(file.name);
      } catch {
        setErrorMessage("File is not valid JSON.");
      }
    };
    reader.readAsText(file);
  };

  // Step 1: Submit BigQuery Connection
  const handleConnectBigQuery = async () => {
    setErrorMessage(null);
    if (!keyJson) {
      setErrorMessage("Please select or drop a service-account JSON key file.");
      return;
    }
    setIsUploadingKey(true);
    setLoadingAnnouncement("Uploading and validating service account JSON key...");
    try {
      const conn = await api.createConnection({
        name: connName,
        warehouse_type: "bigquery",
        key_json: keyJson,
      });
      setCurrentConnection(conn);
      setStep(2);
      setLoadingAnnouncement("Connection established. Loading warehouse projects and datasets...");
      await loadConnections();
      await initializeStep2(conn);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create connection";
      setErrorMessage(msg);
      setLoadingAnnouncement(`Connection failed: ${msg}`);
    } finally {
      setIsUploadingKey(false);
    }
  };

  // Step 1: Use Demo Data (DuckDB) Alternative
  const handleUseDemoData = async () => {
    setErrorMessage(null);
    setIsUsingDemo(true);
    setLoadingAnnouncement("Initializing local DuckDB demo connection...");
    try {
      const conn = await api.createConnection({
        name: "Demo dataset (DuckDB)",
        warehouse_type: "duckdb",
      });
      setCurrentConnection(conn);
      setStep(2);
      setLoadingAnnouncement("Demo data loaded. Displaying tables and sample schema...");
      await loadConnections();
      await initializeStep2(conn);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create demo connection";
      setErrorMessage(msg);
      setLoadingAnnouncement(`Failed to load demo data: ${msg}`);
    } finally {
      setIsUsingDemo(false);
    }
  };

  // Replace Key Execution
  const handleExecuteReplaceKey = async () => {
    if (!replaceTargetConn || !replacementKeyJson) return;
    setIsReplacingKey(true);
    setLoadingAnnouncement("Updating service account key...");
    try {
      const updated = await api.updateKey(replaceTargetConn.id, replacementKeyJson);
      setCurrentConnection(updated);
      await loadConnections();
      setIsReplaceKeyOpen(false);
      setReplacementKeyJson("");
      setReplacementFileName(null);
      setLoadingAnnouncement("Service account key updated successfully.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to replace service account key";
      setErrorMessage(msg);
      setLoadingAnnouncement(`Key replacement failed: ${msg}`);
    } finally {
      setIsReplacingKey(false);
    }
  };

  // Remove Connection Execution
  const handleDeleteConnection = async (conn: ConnectionPublic) => {
    if (!confirm(`Remove connection "${conn.name}"?`)) return;
    setDeletingConnId(conn.id);
    setLoadingAnnouncement(`Removing connection "${conn.name}"...`);
    try {
      await api.deleteConnection(conn.id);
      if (currentConnection?.id === conn.id) {
        setCurrentConnection(null);
      }
      await loadConnections();
      setLoadingAnnouncement(`Connection "${conn.name}" removed.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to remove connection";
      setErrorMessage(msg);
      setLoadingAnnouncement(`Remove failed: ${msg}`);
    } finally {
      setDeletingConnId(null);
    }
  };

  // Step 2 Initializer
  const initializeStep2 = async (conn: ConnectionPublic) => {
    setMetadataLoading(true);
    setLoadingAnnouncement("Listing projects and datasets...");
    try {
      let projs: string[] = [];
      try {
        projs = await api.listProjects(conn.id);
      } catch {
        projs = conn.project_id ? [conn.project_id] : [];
      }
      if (conn.project_id && !projs.includes(conn.project_id)) {
        projs.unshift(conn.project_id);
      }
      setProjects(projs);
      const defaultProj = conn.project_id || projs[0] || "";
      setBillingProject(conn.billing_project || defaultProj);
      setBrowseProject(defaultProj);

      if (defaultProj) {
        try {
          const dsets = await api.listDatasets(conn.id, defaultProj);
          setDatasets(dsets);
          if (dsets.length > 0) {
            setSelectedDataset(dsets[0].dataset_id);
            setDetectedLocation(dsets[0].location || "US");
            await loadTablesForDataset(conn.id, defaultProj, dsets[0].dataset_id);
          }
        } catch (e: unknown) {
          setErrorMessage(e instanceof Error ? e.message : "Failed to list datasets in project");
        }
      }
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to load project metadata");
    } finally {
      setMetadataLoading(false);
    }
  };

  // Helper to load tables for a dataset
  const loadTablesForDataset = async (connId: string, proj: string, datasetId: string) => {
    setTablesLoading(true);
    setLoadingAnnouncement(`Loading tables for dataset ${datasetId}...`);
    try {
      const tbls = await api.listTables(connId, proj, datasetId);
      setTables(tbls);
      if (tbls.length > 0) {
        const firstThree = tbls.slice(0, 3).map((t) => t.table_name);
        setSelectedTableNames(firstThree);
        await inspectTableDetail(connId, proj, datasetId, tbls[0].table_name);
      } else {
        setSelectedTableNames([]);
        setInspectingTable(null);
        setTablePreview(null);
      }
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to list tables in dataset");
    } finally {
      setTablesLoading(false);
    }
  };

  // Switch Dataset
  const handleSelectDataset = async (datasetId: string) => {
    if (!currentConnection) return;
    setSelectedDataset(datasetId);
    const dsObj = datasets.find((d) => d.dataset_id === datasetId);
    if (dsObj) setDetectedLocation(dsObj.location);
    setSelectedTableNames([]);
    setTablePreview(null);
    await loadTablesForDataset(currentConnection.id, browseProject, datasetId);
  };

  // Inspect Table Details & Zero-Cost Preview
  const inspectTableDetail = async (
    connId: string,
    proj: string,
    dataset: string,
    table: string
  ) => {
    setInspectingTable(table);
    setDetailLoading(true);
    setPreviewLoading(true);
    setLoadingAnnouncement(`Loading schema and zero-cost preview for table "${table}"...`);
    try {
      const detail = await api.getTableDetail(connId, proj, dataset, table);
      setTableDetails((prev) => ({ ...prev, [table]: detail }));
      setDetailLoading(false);

      const prev = await api.previewTable(connId, proj, dataset, table, 10);
      setTablePreview(prev);
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to fetch table details");
    } finally {
      setDetailLoading(false);
      setPreviewLoading(false);
    }
  };

  // Add Project by ID
  const handleAddCustomProject = async () => {
    if (!customProjectId || !currentConnection) return;
    setIsAddingProjectLoading(true);
    setLoadingAnnouncement(`Adding project ${customProjectId}...`);
    try {
      setProjects((prev) => Array.from(new Set([...prev, customProjectId])));
      setBrowseProject(customProjectId);
      const dsets = await api.listDatasets(currentConnection.id, customProjectId);
      setDatasets(dsets);
      setIsAddingProjectUI(false);
      if (dsets.length > 0) {
        await handleSelectDataset(dsets[0].dataset_id);
      }
      setLoadingAnnouncement(`Project ${customProjectId} added.`);
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to access project");
      setLoadingAnnouncement("Failed to add project.");
    } finally {
      setIsAddingProjectLoading(false);
    }
  };

  // Step 2 -> Step 3 Transition: Save Sources and Proceed
  const handleProceedToTesting = async () => {
    if (!currentConnection) return;
    if (selectedTableNames.length === 0) {
      setErrorMessage("Please select at least one table or view.");
      return;
    }
    setIsSavingSources(true);
    setErrorMessage(null);
    setLoadingAnnouncement("Saving selected table sources...");
    try {
      const sourceList: TableDetail[] = [];
      for (const tName of selectedTableNames) {
        let detail = tableDetails[tName];
        if (!detail) {
          detail = await api.getTableDetail(currentConnection.id, browseProject, selectedDataset, tName);
        }
        sourceList.push(detail);
      }
      await api.saveSources(currentConnection.id, sourceList);
      setStep(3);
      runConnectionTest(currentConnection.id);
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : "Failed to save selected tables");
    } finally {
      setIsSavingSources(false);
    }
  };

  // Step 3: Run Live Connection Checks with Individual Pending / Running / Passed / Failed States
  const runConnectionTest = async (connId: string) => {
    setTestingInProgress(true);
    setErrorMessage(null);
    setLoadingAnnouncement("Running live warehouse connection verification checks...");

    // Initialize all checks to pending, first to running
    const initialChecks: LiveCheckDisplay[] = DEFAULT_CHECKS.map((c, idx) => ({
      id: c.id,
      title: c.title,
      status: idx === 0 ? "running" : "pending",
      message: c.defaultMsg,
    }));
    setLiveChecks(initialChecks);

    try {
      const result = await api.testConnection(connId);
      setTestResult(result);

      // Map backend check outcomes to live checks
      const mapped: LiveCheckDisplay[] = result.checks.map((c: CheckItem) => ({
        id: c.id,
        title: c.title,
        status: c.status === "passed" ? "passed" : c.status === "failed" ? "failed" : "skipped",
        message: c.message,
        remediation: c.remediation,
      }));
      setLiveChecks(mapped);

      const passCount = mapped.filter((c) => c.status === "passed").length;
      setLoadingAnnouncement(`Connection test finished: ${passCount} of ${mapped.length} checks passed.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection test failed";
      setErrorMessage(msg);
      setLoadingAnnouncement(`Connection test failed: ${msg}`);
    } finally {
      setTestingInProgress(false);
    }
  };

  // Step 3: Save Connection & Complete Flow (immediately switches to Model tab)
  const handleFinalSave = async () => {
    setIsSavingConnection(true);
    setLoadingAnnouncement("Saving connection configuration...");
    try {
      // Small simulated persistence confirmation
      await new Promise((r) => setTimeout(r, 250));
      setSourcesSaved(true);
      setLoadingAnnouncement("Warehouse connection and sources saved successfully.");
      // Auto-advance directly to Model tab with that connection preselected
      setActiveTab("semantic");
    } finally {
      setIsSavingConnection(false);
    }
  };

  return (
    <AppShell dashboardTitle="Data sources">
      {/* Screen reader live announcement */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {loadingAnnouncement}
      </div>

      <div className="flex flex-col gap-6 max-w-5xl mx-auto pb-16">
        {/* Persistent 4-step progress header */}
        <StepIndicator
          steps={workflowSteps}
          onStepClick={handleStepClick}
        />

        {/* Top-Level Tabs: Connection vs Semantic Layer */}
        <div className="flex items-center gap-2 border-b border-[var(--border-hairline)]">
          <button
            type="button"
            onClick={() => setActiveTab("connection")}
            className={`pb-2.5 px-3 text-[13px] font-medium border-b-2 transition-subtle cursor-pointer ${
              activeTab === "connection"
                ? "border-[var(--accent-blue-11)] text-[var(--text-main)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
            data-testid="tab-connection"
          >
            Warehouse connection
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("semantic")}
            className={`pb-2.5 px-3 text-[13px] font-medium border-b-2 transition-subtle cursor-pointer ${
              activeTab === "semantic"
                ? "border-[var(--accent-blue-11)] text-[var(--text-main)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
            }`}
            data-testid="tab-semantic"
          >
            Semantic layer
          </button>
        </div>

        {activeTab === "semantic" ? (
          <SemanticLayerManager
            connections={connections}
            selectedConnectionId={currentConnection?.id}
            onConnectionChange={(connId) => {
              const matched = connections.find((c) => c.id === connId);
              if (matched) setCurrentConnection(matched);
            }}
          />
        ) : (
          <>
            {/* Header & Steps Breadcrumb */}
            <div className="flex flex-col gap-2 border-b border-[var(--border-hairline)] pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-[22px] font-medium text-[var(--text-main)]">
                Connect a warehouse
              </h2>
              <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                Connect BigQuery or local demo data to power dashboards and deterministic explanations.
              </p>
            </div>
            {currentConnection && (
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-mono px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)]">
                  Active: {currentConnection.name} ({currentConnection.warehouse_type})
                </span>
                {currentConnection.warehouse_type === "bigquery" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplaceTargetConn(currentConnection);
                      setIsReplaceKeyOpen(true);
                    }}
                    title="Replace service-account JSON key"
                  >
                    Replace key
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Stepper Navigation */}
          <div className="flex items-center gap-3 pt-3 text-[13px]">
            <button
              onClick={() => setStep(1)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[4px] border transition-subtle cursor-pointer ${
                step === 1
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)] font-semibold"
                  : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
              }`}
            >
              <span className="h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-mono bg-current/10">
                1
              </span>
              <span>1. Connect</span>
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--border-hairline)]" />
            <button
              onClick={() => currentConnection && setStep(2)}
              disabled={!currentConnection}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[4px] border transition-subtle cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                step === 2
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)] font-semibold"
                  : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
              }`}
            >
              <span className="h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-mono bg-current/10">
                2
              </span>
              <span>2. Choose data</span>
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--border-hairline)]" />
            <button
              onClick={() => currentConnection && selectedTableNames.length > 0 && setStep(3)}
              disabled={!currentConnection || selectedTableNames.length === 0}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-[4px] border transition-subtle cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                step === 3
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)] font-semibold"
                  : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)]"
              }`}
            >
              <span className="h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-mono bg-current/10">
                3
              </span>
              <span>3. Test and save</span>
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="p-3.5 rounded-[4px] border border-[var(--trend-down)] bg-[var(--trend-down-subtle)] text-[var(--trend-down)] flex items-start gap-2.5 text-[13px]">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
            <button onClick={() => setErrorMessage(null)} className="cursor-pointer" aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ================= STEP 1: CONNECT ================= */}
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left 2 Cols: Form */}
            <div className="md:col-span-2 flex flex-col gap-5 p-5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
              <div>
                <h3 className="font-heading text-[18px] font-medium text-[var(--text-main)]">
                  Google BigQuery connection
                </h3>
                <p className="text-[13px] text-[var(--text-muted)] mt-1">
                  Connect using a read-only service account key. Your key is encrypted at rest (AES-256-GCM) and the private key is never returned or logged.
                </p>
              </div>

              <Input
                label="Connection name"
                value={connName}
                onChange={(e) => setConnName(e.target.value)}
                placeholder="e.g. Production BigQuery, TheLook Ecommerce"
              />

              {/* Upload Dropzone */}
              <div>
                <label className="text-[12px] font-medium text-[var(--text-muted)] tracking-wide uppercase block mb-1.5">
                  Service account JSON key
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files.length > 0) {
                      handleKeyFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-[4px] p-6 text-center transition-subtle flex flex-col items-center justify-center ${
                    keyJson
                      ? "border-[var(--trend-up)] bg-[var(--trend-up-subtle)]"
                      : "border-[var(--border-hairline)] bg-[var(--bg-app)] hover:border-[var(--border-focus)]"
                  }`}
                >
                  <Upload className="h-7 w-7 text-[var(--text-muted)] mb-2" />
                  {keyFileName ? (
                    <div className="flex flex-col items-center">
                      <span className="text-[14px] font-medium text-[var(--text-main)]">
                        {keyFileName}
                      </span>
                      <span className="text-[12px] text-[var(--text-muted)] font-mono mt-0.5">
                        {keyFileSize ? `${(keyFileSize / 1024).toFixed(1)} KB` : "Valid JSON"} • Service account key verified
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[13px] text-[var(--text-main)] font-medium">
                        Drag and drop your service-account JSON key here
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)] mt-1">
                        or click below to browse (maximum 64 KB)
                      </p>
                      <label className="mt-3 inline-block">
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              handleKeyFileUpload(e.target.files[0]);
                            }
                          }}
                        />
                        <span className="inline-flex items-center justify-center font-medium transition-subtle cursor-pointer h-7 px-3 text-[12px] rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]">
                          Browse file
                        </span>
                      </label>
                    </div>
                  )}
                </div>

                <p className="text-[12px] text-[var(--text-muted)] mt-2 leading-relaxed">
                  Create a service account in Google Cloud Console, grant role{" "}
                  <code className="font-mono text-[11px] bg-[var(--bg-subtle)] px-1 py-0.5 rounded">
                    BigQuery Job User
                  </code>{" "}
                  on the project that will run queries and{" "}
                  <code className="font-mono text-[11px] bg-[var(--bg-subtle)] px-1 py-0.5 rounded">
                    BigQuery Data Viewer
                  </code>{" "}
                  on the datasets to read, then create a JSON key.
                </p>
              </div>

              {/* Action Buttons with explicit loading state */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--border-hairline)]">
                <Button
                  variant="primary"
                  onClick={handleConnectBigQuery}
                  disabled={!keyJson || isUploadingKey}
                  isLoading={isUploadingKey}
                  aria-busy={isUploadingKey}
                >
                  Continue to choose data
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>

                <Button
                  variant="outline"
                  onClick={handleUseDemoData}
                  disabled={isUsingDemo}
                  isLoading={isUsingDemo}
                  aria-busy={isUsingDemo}
                >
                  Use demo data (DuckDB)
                </Button>
              </div>
            </div>

            {/* Right 1 Col: Saved Connections & Info */}
            <div className="flex flex-col gap-4">
              <div className="p-4 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
                <h4 className="font-heading text-[16px] font-medium text-[var(--text-main)] mb-2">
                  Saved connections
                </h4>
                {connections.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-muted)]">
                    No connections saved yet. Connect BigQuery or use demo data.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {connections.map((c) => (
                      <div
                        key={c.id}
                        className="p-2.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-app)] flex items-center justify-between text-[12px]"
                      >
                        <div className="overflow-hidden pr-2">
                          <span className="font-medium text-[var(--text-main)] block truncate">
                            {c.name}
                          </span>
                          <span className="text-[var(--text-muted)] font-mono text-[11px] truncate block">
                            {c.warehouse_type === "bigquery" ? c.client_email : "DuckDB local"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {c.selected_tables_count === 0 ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setCurrentConnection(c);
                                initializeStep2(c);
                                setStep(2);
                              }}
                              title="Open connection"
                              data-testid={`action-choose-tables-${c.id}`}
                            >
                              Choose tables
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setCurrentConnection(c);
                                setActiveTab("semantic");
                              }}
                              title="Define semantic model"
                              data-testid={`action-define-model-${c.id}`}
                            >
                              Define model
                            </Button>
                          )}
                          {c.warehouse_type === "bigquery" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setReplaceTargetConn(c);
                                setIsReplaceKeyOpen(true);
                              }}
                              title="Replace key"
                            >
                              Key
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteConnection(c)}
                            disabled={deletingConnId === c.id}
                            isLoading={deletingConnId === c.id}
                            aria-busy={deletingConnId === c.id}
                            title="Remove connection"
                            aria-label={`Remove connection ${c.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-[var(--trend-down)]" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-subtle)] text-[12px] text-[var(--text-muted)] flex flex-col gap-2 leading-relaxed">
                <div className="flex items-center gap-2 font-medium text-[var(--text-main)]">
                  <KeyRound className="h-4 w-4" />
                  <span>Security & query guardrails</span>
                </div>
                <p>• Master encryption key: AES-256-GCM authenticated cipher.</p>
                <p>• SELECT only guardrail: parsed with dialect AST to prevent mutations, DDL, or external queries.</p>
                <p>• Byte cap: dry runs enforce a 10.0 GB scan limit per query.</p>
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 2: CHOOSE DATA ================= */}
        {step === 2 && currentConnection && (
          <div className="flex flex-col gap-5">
            {/* Top Config: Projects and Datasets */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)]">
              {/* Billing project */}
              <div>
                <label className="text-[12px] font-medium text-[var(--text-muted)] tracking-wide uppercase block mb-1">
                  Billing project (runs queries)
                </label>
                {showMetadataSkeleton ? (
                  <div className="h-8.5 w-full bg-[var(--bg-subtle)] rounded-[4px] animate-pulse" role="status" aria-label="Loading billing projects" />
                ) : (
                  <select
                    value={billingProject}
                    onChange={(e) => setBillingProject(e.target.value)}
                    className="w-full h-8.5 px-3 text-[13px] font-mono border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-app)] text-[var(--text-main)]"
                  >
                    {projects.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Browse project */}
              <div>
                <label className="text-[12px] font-medium text-[var(--text-muted)] tracking-wide uppercase block mb-1">
                  Browse project
                </label>
                {showMetadataSkeleton ? (
                  <div className="h-8.5 w-full bg-[var(--bg-subtle)] rounded-[4px] animate-pulse" role="status" aria-label="Loading browse projects" />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <select
                      value={browseProject}
                      onChange={(e) => {
                        const val = e.target.value;
                        setBrowseProject(val);
                        api.listDatasets(currentConnection.id, val).then((dsets) => {
                          setDatasets(dsets);
                          if (dsets.length > 0) handleSelectDataset(dsets[0].dataset_id);
                        });
                      }}
                      className="w-full h-8.5 px-3 text-[13px] font-mono border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-app)] text-[var(--text-main)]"
                    >
                      {projects.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                      {customProjectId && <option value={customProjectId}>{customProjectId}</option>}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsAddingProjectUI(!isAddingProjectUI)}
                      title="Add project by ID (e.g. bigquery-public-data)"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                {isAddingProjectUI && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Input
                      placeholder="e.g. bigquery-public-data"
                      value={customProjectId}
                      onChange={(e) => setCustomProjectId(e.target.value)}
                      className="text-[12px]"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleAddCustomProject}
                      disabled={!customProjectId || isAddingProjectLoading}
                      isLoading={isAddingProjectLoading}
                      aria-busy={isAddingProjectLoading}
                    >
                      Add
                    </Button>
                  </div>
                )}
              </div>

              {/* Dataset selection */}
              <div>
                <label className="text-[12px] font-medium text-[var(--text-muted)] tracking-wide uppercase block mb-1">
                  Dataset ({detectedLocation})
                </label>
                {showMetadataSkeleton ? (
                  <div className="h-8.5 w-full bg-[var(--bg-subtle)] rounded-[4px] animate-pulse" role="status" aria-label="Loading datasets" />
                ) : (
                  <select
                    value={selectedDataset}
                    onChange={(e) => handleSelectDataset(e.target.value)}
                    className="w-full h-8.5 px-3 text-[13px] font-mono border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-app)] text-[var(--text-main)]"
                  >
                    {datasets.map((d) => (
                      <option key={d.dataset_id} value={d.dataset_id}>
                        {d.dataset_id} ({d.location || "US"})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Tables Selection & Inspector Split View */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Left 5 Cols: Table Checklist */}
              <div className="md:col-span-5 p-4 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-heading text-[16px] font-medium text-[var(--text-main)]">
                    Select tables & views
                  </h4>
                  <span className="text-[12px] font-mono text-[var(--text-muted)]">
                    {selectedTableNames.length} selected
                  </span>
                </div>

                {/* Skeletons for table list matching exact final layout */}
                {showTableSkeleton ? (
                  <div className="flex flex-col gap-1.5" role="status" aria-label="Loading tables list">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded border border-[var(--border-hairline)] bg-[var(--bg-app)]"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div className="h-4 w-4 bg-[var(--bg-subtle)] rounded animate-pulse" />
                          <div
                            className="h-3.5 bg-[var(--bg-subtle)] rounded animate-pulse"
                            style={{ width: `${90 + (i % 3) * 35}px` }}
                          />
                          <div className="h-3 w-10 bg-[var(--bg-subtle)] rounded animate-pulse" />
                        </div>
                        <div className="h-6 w-6 bg-[var(--bg-subtle)] rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[460px] overflow-y-auto">
                    {tables.map((tbl) => {
                      const isChecked = selectedTableNames.includes(tbl.table_name);
                      const isInspecting = inspectingTable === tbl.table_name;
                      return (
                        <div
                          key={tbl.table_name}
                          className={`flex items-center justify-between p-2 rounded border transition-subtle ${
                            isInspecting
                              ? "border-[var(--accent)] bg-[var(--bg-subtle)]"
                              : "border-[var(--border-hairline)] bg-[var(--bg-app)] hover:border-[var(--border-strong)]"
                          }`}
                        >
                          <label className="flex items-center gap-2 text-[13px] font-mono cursor-pointer flex-1 overflow-hidden">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTableNames((prev) => [...prev, tbl.table_name]);
                                } else {
                                  setSelectedTableNames((prev) =>
                                    prev.filter((t) => t !== tbl.table_name)
                                  );
                                }
                              }}
                              className="rounded border-[var(--border-hairline)] text-[var(--accent)]"
                            />
                            <span className="truncate">{tbl.table_name}</span>
                            <span className="text-[10px] text-[var(--text-muted)] uppercase font-sans">
                              {tbl.table_type}
                            </span>
                          </label>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              inspectTableDetail(
                                currentConnection.id,
                                browseProject,
                                selectedDataset,
                                tbl.table_name
                              )
                            }
                            title="Inspect table details and preview"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right 7 Cols: Table Details & Zero-Cost Preview Inspector */}
              <div className="md:col-span-7 p-4 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] flex flex-col gap-4">
                {showDetailSkeleton ? (
                  /* Layout-matching skeleton for Table Details Panel */
                  <div className="flex flex-col gap-4" role="status" aria-label="Loading table details">
                    <div className="border-b border-[var(--border-hairline)] pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 bg-[var(--bg-subtle)] rounded animate-pulse" />
                          <div className="h-5 w-48 bg-[var(--bg-subtle)] rounded animate-pulse" />
                        </div>
                        <div className="h-5 w-28 bg-[var(--bg-subtle)] rounded animate-pulse" />
                      </div>
                      <div className="flex gap-2 mt-2">
                        <div className="h-4 w-36 bg-[var(--bg-subtle)] rounded animate-pulse" />
                        <div className="h-4 w-24 bg-[var(--bg-subtle)] rounded animate-pulse" />
                      </div>
                    </div>

                    <div>
                      <div className="h-3.5 w-24 bg-[var(--bg-subtle)] rounded animate-pulse mb-2" />
                      <div className="border border-[var(--border-hairline)] rounded p-2 flex flex-col gap-2">
                        <div className="h-4 w-full bg-[var(--bg-subtle)]/60 rounded animate-pulse" />
                        <div className="h-4 w-full bg-[var(--bg-subtle)]/40 rounded animate-pulse" />
                        <div className="h-4 w-full bg-[var(--bg-subtle)]/40 rounded animate-pulse" />
                        <div className="h-4 w-full bg-[var(--bg-subtle)]/40 rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                ) : inspectingTable && tableDetails[inspectingTable] ? (
                  <>
                    {/* Header Stats */}
                    <div className="border-b border-[var(--border-hairline)] pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Database className="h-4 w-4 text-[var(--accent-text)]" />
                          <h4 className="font-heading text-[18px] font-medium text-[var(--text-main)] font-mono">
                            {tableDetails[inspectingTable].table_name}
                          </h4>
                        </div>
                        <span className="text-[12px] font-mono px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                          {tableDetails[inspectingTable].formatted_size} •{" "}
                          {tableDetails[inspectingTable].row_count.toLocaleString()} rows
                        </span>
                      </div>

                      {/* Partition & Clustering Badges */}
                      <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
                        {tableDetails[inspectingTable].partition_field ? (
                          <span className="px-2 py-0.5 rounded bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent-subtle)] font-mono">
                            Partitioned by {tableDetails[inspectingTable].partition_field} (
                            {tableDetails[inspectingTable].partition_type})
                            {tableDetails[inspectingTable].require_partition_filter &&
                              " • Filter required"}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                            No partitioning
                          </span>
                        )}
                        {tableDetails[inspectingTable].clustering_fields.length > 0 && (
                          <span className="px-2 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-muted)] font-mono">
                            Clustered: {tableDetails[inspectingTable].clustering_fields.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Columns & Schema */}
                    <div>
                      <div className="text-[12px] font-medium text-[var(--text-muted)] uppercase tracking-wide mb-1.5">
                        Schema ({tableDetails[inspectingTable].columns.length} columns)
                      </div>
                      <div className="max-h-[160px] overflow-y-auto border border-[var(--border-hairline)] rounded text-[12px] font-mono">
                        <table className="w-full text-left">
                          <thead className="bg-[var(--bg-app)] border-b border-[var(--border-hairline)] text-[var(--text-muted)]">
                            <tr>
                              <th className="p-1.5 pl-2">Column</th>
                              <th className="p-1.5">Type</th>
                              <th className="p-1.5">Nullable</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tableDetails[inspectingTable].columns.map((col) => (
                              <tr key={col.name} className="border-b border-[var(--border-hairline)] last:border-0">
                                <td className="p-1.5 pl-2 font-medium text-[var(--text-main)]">{col.name}</td>
                                <td className="p-1.5 text-[var(--text-muted)]">{col.data_type}</td>
                                <td className="p-1.5 text-[var(--text-muted)]">{col.is_nullable ? "YES" : "NO"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 10-Row Zero Cost Table Rows Preview */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-[12px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
                          Sample preview (10 rows)
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--trend-up-subtle)] text-[var(--trend-up)] border border-[var(--trend-up)]">
                          table-rows API • zero query cost
                        </span>
                      </div>

                      {showPreviewSkeleton ? (
                        /* Skeletons for 10-row preview matching exact table grid */
                        <div className="border border-[var(--border-hairline)] rounded overflow-hidden" role="status" aria-label="Loading preview rows">
                          <div className="flex border-b border-[var(--border-hairline)] bg-[var(--bg-app)] p-2 gap-3">
                            {[1, 2, 3, 4, 5].map((c) => (
                              <div key={c} className="h-3.5 flex-1 bg-[var(--bg-subtle)] rounded animate-pulse" />
                            ))}
                          </div>
                          {[1, 2, 3, 4, 5, 6].map((r) => (
                            <div key={r} className="flex border-b border-[var(--border-hairline)] last:border-0 p-2 gap-3">
                              {[1, 2, 3, 4, 5].map((c) => (
                                <div key={c} className="h-3 flex-1 bg-[var(--bg-subtle)]/60 rounded animate-pulse" />
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : tablePreview && tablePreview.rows.length > 0 ? (
                        <div className="overflow-x-auto max-h-[160px] border border-[var(--border-hairline)] rounded text-[11px] font-mono">
                          <table className="w-full text-left whitespace-nowrap">
                            <thead className="bg-[var(--bg-app)] border-b border-[var(--border-hairline)] text-[var(--text-muted)]">
                              <tr>
                                {tablePreview.columns.map((c) => (
                                  <th key={c} className="p-1.5 px-2">
                                    {c}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tablePreview.rows.map((row, idx) => (
                                <tr key={idx} className="border-b border-[var(--border-hairline)] last:border-0">
                                  {tablePreview.columns.map((c) => (
                                    <td key={c} className="p-1.5 px-2 text-[var(--text-main)]">
                                      {String(row[c] ?? "null")}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="p-4 text-center text-[12px] text-[var(--text-muted)] border border-[var(--border-hairline)] rounded bg-[var(--bg-app)]">
                          No preview rows available for this table.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--text-muted)]">
                    <FileText className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-[13px]">
                      Select a table on the left to inspect its schema, partitioning, and zero-cost 10-row preview.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[var(--border-hairline)]">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back to connection
              </Button>
              <Button
                variant="primary"
                onClick={handleProceedToTesting}
                disabled={selectedTableNames.length === 0 || isSavingSources}
                isLoading={isSavingSources}
                aria-busy={isSavingSources}
              >
                Proceed to test & save ({selectedTableNames.length} tables selected)
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: TEST AND SAVE ================= */}
        {step === 3 && currentConnection && (
          <div className="flex flex-col gap-6">
            <div className="p-5 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--bg-surface)] flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
                <div>
                  <h3 className="font-heading text-[18px] font-medium text-[var(--text-main)]">
                    Connection verification checklist
                  </h3>
                  <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
                    Live verification against BigQuery API permissions and query guardrails.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runConnectionTest(currentConnection.id)}
                  disabled={testingInProgress}
                  isLoading={testingInProgress}
                  aria-busy={testingInProgress}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  Re-run checks
                </Button>
              </div>

              {/* Individual 7 Checks: pending, running (small spinner), passed, failed */}
              <div className="flex flex-col gap-2.5" role="list" aria-label="Connection verification checks">
                {liveChecks.map((check) => {
                  const isPassed = check.status === "passed";
                  const isFailed = check.status === "failed";
                  const isRunning = check.status === "running";
                  const isPending = check.status === "pending";

                  return (
                    <div
                      key={check.id}
                      role="listitem"
                      aria-label={`${check.title}: ${check.status}`}
                      className={`p-3.5 rounded-[4px] border flex flex-col gap-1 text-[13px] transition-subtle ${
                        isPassed
                          ? "border-[var(--trend-up)]/40 bg-[var(--trend-up-subtle)]/30 text-[var(--text-main)]"
                          : isFailed
                          ? "border-[var(--trend-down)] bg-[var(--trend-down-subtle)]/60 text-[var(--text-main)]"
                          : isRunning
                          ? "border-[var(--accent)] bg-[var(--accent-subtle)]/20 text-[var(--text-main)]"
                          : "border-[var(--border-hairline)] bg-[var(--bg-app)] text-[var(--text-muted)] opacity-75"
                      }`}
                    >
                      <div className="flex items-center justify-between font-medium">
                        <div className="flex items-center gap-2.5">
                          {isPassed && <CheckCircle2 className="h-4 w-4 text-[var(--trend-up)] shrink-0" />}
                          {isFailed && <AlertCircle className="h-4 w-4 text-[var(--trend-down)] shrink-0" />}
                          {isRunning && (
                            <svg
                              className="animate-spin h-4 w-4 text-[var(--accent-solid-bg)] shrink-0"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                          )}
                          {isPending && (
                            <span className="h-4 w-4 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-subtle)] shrink-0 flex items-center justify-center text-[10px] text-[var(--text-muted)] font-mono">
                              •
                            </span>
                          )}
                          <span
                            className={
                              isPassed
                                ? "text-[var(--text-main)]"
                                : isFailed
                                ? "text-[var(--trend-down)] font-semibold"
                                : isRunning
                                ? "text-[var(--accent-text)] font-semibold"
                                : "text-[var(--text-muted)]"
                            }
                          >
                            {check.title}
                          </span>
                        </div>

                        {/* Status Tag */}
                        <span
                          className={`text-[11px] font-mono px-2 py-0.5 rounded uppercase ${
                            isPassed
                              ? "bg-[var(--trend-up-subtle)] text-[var(--trend-up)] border border-[var(--trend-up)]"
                              : isFailed
                              ? "bg-[var(--trend-down-subtle)] text-[var(--trend-down)] border border-[var(--trend-down)]"
                              : isRunning
                              ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] border border-[var(--accent)]"
                              : "bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                          }`}
                        >
                          {check.status}
                        </span>
                      </div>

                      <p className="text-[12px] text-[var(--text-muted)] pl-6.5">{check.message}</p>

                      {check.remediation && (
                        <div className="ml-6.5 mt-1 p-2 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[12px] text-[var(--trend-down)] font-sans">
                          <span className="font-semibold block mb-0.5">Fix:</span>
                          {check.remediation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Completion Banner */}
              {sourcesSaved && (
                <div className="p-4 rounded-[4px] border border-[var(--trend-up)] bg-[var(--trend-up-subtle)] text-[var(--trend-up)] flex items-center gap-3">
                  <Check className="h-5 w-5" />
                  <div>
                    <span className="font-semibold block text-[14px]">
                      Warehouse connection and sources saved successfully
                    </span>
                    <span className="text-[12px] text-[var(--text-muted)]">
                      The selected tables are now ready for the semantic layer to declare models, dimensions, and metrics.
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-[var(--border-hairline)]">
                <Button variant="secondary" onClick={() => setStep(2)}>
                  Back to table selection
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={handleFinalSave}
                    disabled={testResult?.overall_status === "failed" || sourcesSaved || isSavingConnection}
                    isLoading={isSavingConnection}
                    aria-busy={isSavingConnection}
                  >
                    {sourcesSaved ? "Sources saved" : "Save connection & continue"}
                  </Button>
                  {sourcesSaved && (
                    <Button
                      variant="primary"
                      onClick={() => setActiveTab("semantic")}
                      data-testid="go-to-semantic-btn"
                    >
                      Go to semantic layer
                      <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {/* Replace Key Dialog */}
      <Dialog open={isReplaceKeyOpen} onOpenChange={setIsReplaceKeyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Replace service account key</DialogTitle>
            <DialogDescription>
              Upload a new service-account JSON key for &quot;{replaceTargetConn?.name}&quot;. The new key will be verified and encrypted at rest with AES-256-GCM.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="border-2 border-dashed rounded-[4px] p-6 text-center transition-subtle flex flex-col items-center justify-center border-[var(--border-hairline)] bg-[var(--bg-app)]">
              <Upload className="h-7 w-7 text-[var(--text-muted)] mb-2" />
              {replacementFileName ? (
                <span className="text-[13px] font-medium text-[var(--text-main)]">
                  {replacementFileName}
                </span>
              ) : (
                <>
                  <p className="text-[13px] text-[var(--text-main)] font-medium">
                    Drag and drop your replacement JSON key
                  </p>
                  <label className="mt-3 inline-block">
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleReplacementKeyUpload(e.target.files[0]);
                        }
                      }}
                    />
                    <span className="inline-flex items-center justify-center font-medium transition-subtle cursor-pointer h-7 px-3 text-[12px] rounded-[4px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-main)] hover:bg-[var(--bg-surface-hover)]">
                      Browse file
                    </span>
                  </label>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
              <Button variant="secondary" onClick={() => setIsReplaceKeyOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleExecuteReplaceKey}
                disabled={!replacementKeyJson || isReplacingKey}
                isLoading={isReplacingKey}
                aria-busy={isReplacingKey}
              >
                Replace key
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Dashboard Dialog */}
      <CreateDashboardDialog
        open={isCreateDashboardOpen}
        onOpenChange={setIsCreateDashboardOpen}
        connections={connections}
        defaultConnectionId={currentConnection?.id}
      />
    </AppShell>
  );
}
