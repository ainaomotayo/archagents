{{- define "sentinel.fullname" -}}
{{- printf "%s" .Chart.Name -}}
{{- end -}}

{{- define "sentinel.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
