{{/*
Expand the name of the chart.
*/}}
{{- define "hermeum.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully qualified app name (release + chart name, truncated).
*/}}
{{- define "hermeum.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Chart name + version label, used by the standard labels.
*/}}
{{- define "hermeum.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels applied to every resource the chart owns.
*/}}
{{- define "hermeum.labels" -}}
helm.sh/chart: {{ include "hermeum.chart" . }}
{{ include "hermeum.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/component: app
{{- end -}}

{{/*
Selector labels — must be stable across releases for Services/Deployments.
*/}}
{{- define "hermeum.selectorLabels" -}}
app.kubernetes.io/name: {{ include "hermeum.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Resolve the hermeum image reference. Tag defaults to Chart.appVersion.
*/}}
{{- define "hermeum.image" -}}
{{- $tag := .Values.image.tag -}}
{{- if not $tag -}}
{{- $tag = .Chart.AppVersion -}}
{{- end -}}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end -}}

{{/*
Service account name: explicit override, otherwise the templated SA name.
*/}}
{{- define "hermeum.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "hermeum.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
Kubernetes namespace where HermesAgent CRs are reconciled. Defaults to the
release namespace when config.kubernetesNamespace is empty.
*/}}
{{- define "hermeum.namespace" -}}
{{- default .Release.Namespace .Values.config.kubernetesNamespace -}}
{{- end -}}

{{/*
Webhook TLS Secret name: operator-supplied, or the chart-managed one.
*/}}
{{- define "hermeum.webhookTlsSecretName" -}}
{{- default (printf "%s-webhook-tls" (include "hermeum.fullname" .)) .Values.webhook.tls.existingSecret -}}
{{- end -}}

{{/*
Non-sensitive env Secret name: operator-supplied, or the chart-managed one.
*/}}
{{- define "hermeum.secretName" -}}
{{- default (printf "%s-secret" (include "hermeum.fullname" .)) .Values.secrets.existingSecret -}}
{{- end -}}

{{/*
Name of the MutatingWebhookConfiguration.
*/}}
{{- define "hermeum.webhookName" -}}
{{- printf "%s-mutating-webhook" (include "hermeum.fullname" .) -}}
{{- end -}}

{{/*
Whether the chart should provision the webhook TLS cert (no existingSecret).
*/}}
{{- define "hermeum.provisionWebhookCert" -}}
{{- if and .Values.webhook.enabled (not .Values.webhook.tls.existingSecret) -}}
true
{{- end -}}
{{- end -}}

{{/*
Whether the chart should template its own Secret for sensitive env vars.
*/}}
{{- define "hermeum.createSecret" -}}
{{- if not .Values.secrets.existingSecret -}}
true
{{- end -}}
{{- end -}}

{{/*
Whether the chart should emit the agentConfig ConfigMap.
*/}}
{{- define "hermeum.hasAgentConfig" -}}
{{- if .Values.agentConfig -}}
true
{{- end -}}
{{- end -}}

{{/*
Stable checksum of the agentConfig content — used as a pod annotation so the
Deployment rolls whenever the ConfigMap changes.
*/}}
{{- define "hermeum.agentConfigChecksum" -}}
{{- if .Values.agentConfig -}}
{{- .Values.agentConfig | toYaml | sha256sum -}}
{{- else -}}
{{- "" -}}
{{- end -}}
{{- end -}}