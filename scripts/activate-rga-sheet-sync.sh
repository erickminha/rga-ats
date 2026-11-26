#!/usr/bin/env bash
# Run only after the approved homolog build has deployed.
set -euo pipefail
project=rga-ats-homolog
region=us-west1
service=rga-ats
org=ca12a11c-0a43-4842-a70d-16757632b0d0
admin=7ac5d0d7-f51f-4b08-8e7e-8793f341c9dd
sheet=11EmQzk6OcjLQhw8AOMohpLetRwjtkpBl3CSrcrdpyGs
origin="$(gcloud run services describe "$service" --project "$project" --region "$region" --format='value(status.url)')"
test -n "$origin"
gcloud services enable cloudscheduler.googleapis.com --project "$project"

# Do not display or read the secret's value.
secret_args=()
if ! gcloud run services describe "$service" --project "$project" --region "$region" --format=json | python3 -c 'import json,sys; x=json.load(sys.stdin); sys.exit(0 if any(e.get("name")=="RGA_GOOGLE_SERVICE_ACCOUNT" and (e.get("valueFrom") or e.get("value")) for c in x["spec"]["template"]["spec"]["containers"] for e in c.get("env",[])) else 1)'; then
  : "${RGA_ATS_SHEETS_SECRET:?Informe o nome do segredo JSON da conta leitora da planilha em RGA_ATS_SHEETS_SECRET.}"
  gcloud secrets describe "$RGA_ATS_SHEETS_SECRET" --project "$project" --format='value(name)' >/dev/null
  runtime="$(gcloud run services describe "$service" --project "$project" --region "$region" --format='value(spec.template.spec.serviceAccountName)')"
  test -n "$runtime"
  gcloud secrets add-iam-policy-binding "$RGA_ATS_SHEETS_SECRET" --project "$project" --member="serviceAccount:$runtime" --role=roles/secretmanager.secretAccessor --quiet >/dev/null
  secret_args+=("--update-secrets=RGA_GOOGLE_SERVICE_ACCOUNT=$RGA_ATS_SHEETS_SECRET:latest")
fi

# Dedicated least-privilege Scheduler caller.
scheduler="rga-talent-scheduler@$project.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "$scheduler" --project "$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create rga-talent-scheduler --project "$project" --display-name="RGA talent sync scheduler"
fi
gcloud run services add-iam-policy-binding "$service" --project "$project" --region "$region" --member="serviceAccount:$scheduler" --role=roles/run.invoker --quiet >/dev/null
gcloud run services update "$service" --project "$project" --region "$region" \
  --update-env-vars="RGA_TALENT_SYNC_ORG_ID=$org,RGA_TALENT_SYNC_ADMIN_ID=$admin,RGA_TALENT_SHEET_ID=$sheet,RGA_TALENT_SYNC_DAILY=true,RGA_TALENT_DRIVE_ID_FROM=2026-11-24T16:48:53Z,RGA_SUMMARY_SOURCE=sheet,RGA_SUMMARY_AUTO=false,RGA_SUMMARY_ALLOW_GROQ=false,RGA_TALENT_SCHEDULER_EMAIL=$scheduler,RGA_TALENT_SCHEDULER_AUDIENCE=$origin" \
  "${secret_args[@]}" --quiet

configure_job() {
  local name="$1" endpoint="$2" schedule="$3" uri="$origin/$2" existing state
  existing="$(gcloud scheduler jobs list --project "$project" --location "$region" --format=json | python3 -c 'import json,sys; suffix="/"+sys.argv[1]; jobs=[x["name"].split("/")[-1] for x in json.load(sys.stdin) if x.get("httpTarget",{}).get("uri","").rstrip("/").endswith(suffix)]; sys.exit("Multiple equivalent jobs: review before activation.") if len(jobs)>1 else print(jobs[0] if jobs else "")' "$endpoint")"
  if [[ -n "$existing" ]]; then name="$existing"; fi
  local args=(--project "$project" --location "$region" --schedule "$schedule" --time-zone America/Sao_Paulo --uri "$uri" --http-method POST --oidc-service-account-email "$scheduler" --oidc-token-audience "$origin")
  if gcloud scheduler jobs describe "$name" --project "$project" --location "$region" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "$name" "${args[@]}" --quiet
  else
    gcloud scheduler jobs create http "$name" "${args[@]}" --quiet
  fi
  state="$(gcloud scheduler jobs describe "$name" --project "$project" --location "$region" --format='value(state)')"
  if [[ "$state" == PAUSED ]]; then gcloud scheduler jobs resume "$name" --project "$project" --location "$region" --quiet; fi
  if [[ "$endpoint" == api/cron/rga-talentos ]]; then
    gcloud scheduler jobs run "$name" --project "$project" --location "$region" --quiet
  fi
}
configure_job rga-talentos-processar api/cron/rga-talentos-processar '*/5 * * * *'
configure_job rga-talentos-diario api/cron/rga-talentos '0 3 * * *'
gcloud scheduler jobs list --project "$project" --location "$region" --format='table(name,state,schedule,timeZone,httpTarget.uri)'
echo "Confira a execução real no histórico do ATS: $origin/contacts/sincronizar"
