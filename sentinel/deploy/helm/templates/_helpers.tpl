{{- define "sentinel.fullname" -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "sentinel.labels" -}}
app.kubernetes.io/name: sentinel
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "sentinel.selectorLabels" -}}
app.kubernetes.io/name: sentinel
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "sentinel.image" -}}
{{- if .global.imageRegistry -}}
{{- printf "%s/%s:%s" .global.imageRegistry .repository (.tag | default "latest") -}}
{{- else -}}
{{- printf "%s:%s" .repository (.tag | default "latest") -}}
{{- end -}}
{{- end -}}

{{- define "sentinel.commonEnv" -}}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "sentinel.fullname" . }}-secrets
      key: database-url
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "sentinel.fullname" . }}-secrets
      key: redis-url
- name: SENTINEL_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ include "sentinel.fullname" . }}-secrets
      key: sentinel-secret
{{- end -}}

{{- define "sentinel.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: 1000
runAsGroup: 1000
fsGroup: 1000
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "sentinel.containerSecurityContext" -}}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: [ALL]
{{- end -}}
