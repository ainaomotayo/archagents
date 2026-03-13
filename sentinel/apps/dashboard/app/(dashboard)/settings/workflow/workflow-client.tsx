"use client";

import { useCallback } from "react";
import { WorkflowConfigEditor } from "@/components/remediations/workflow-config-editor";
import { saveWorkflowConfigAction } from "./workflow-actions";

interface WorkflowClientProps {
  initialSkipStages: string[];
}

export function WorkflowClient({ initialSkipStages }: WorkflowClientProps) {
  const handleSave = useCallback(async (skipStages: string[]) => {
    await saveWorkflowConfigAction(skipStages);
  }, []);

  return (
    <WorkflowConfigEditor
      initialSkipStages={initialSkipStages}
      onSave={handleSave}
    />
  );
}
