#!/usr/bin/env bash
# Usage: evals/run-evals.sh <agent_version> <case> [case...]   (cases = folder names under evals/)
# One session per case against the PINNED Judge version, outcome kickoff (rubric = ../outcome.md),
# polls until idle, collects outcome_evaluations[] verdict + usage + parsed report into evals/results-v<N>.json.
set -euo pipefail
cd "$(dirname "$0")"
ENVF="${ENV_FILE:-../../.env}"; [ -f "$ENVF" ] && set -a && . "$ENVF" && set +a
: "${ANTHROPIC_API_KEY:?}" "${JUDGE_ID:?}" "${ENVIRONMENT_ID:?}"
V="$1"; shift
export V EVAL_BUDGET_CENTS="${EVAL_BUDGET_CENTS:-200}" EVAL_MAX_ITER="${EVAL_MAX_ITER:-1}"
python3 - "$@" <<'PY'
import json, os, sys, time, re, urllib.request as u, concurrent.futures as cf
E=os.environ; H={'x-api-key':E['ANTHROPIC_API_KEY'],'anthropic-version':'2023-06-01','anthropic-beta':'managed-agents-2026-04-01','content-type':'application/json'}
def call(m,p,b=None):
    r=u.Request('https://api.anthropic.com/v1'+p,method=m,headers=H,data=json.dumps(b).encode() if b else None)
    return json.loads(u.urlopen(r).read(),strict=False)
task=open('../first_prompt.txt').read(); rubric=open('../outcome.md').read()
def run(case):
    inp=open(f'{case}/input.md').read(); brand=re.search(r'Brand: (.*)',inp).group(1)
    body={'agent':{'type':'agent','id':E['JUDGE_ID'],'version':int(E['V'])},'environment_id':E['ENVIRONMENT_ID'],'title':f'eval v{E["V"]}: {case}',
          'budget':{'type':'limit','max_list_cost':{'amount':E['EVAL_BUDGET_CENTS'],'currency':'USD'}},
          'initial_events':[{'type':'user.define_outcome','description':task.replace('{{BRAND}}',brand)+'\n\n'+inp,'rubric':{'type':'text','content':rubric},'max_iterations':int(E['EVAL_MAX_ITER'])}]}
    if E.get('MEMORY_STORE_ID'): body['resources']=[{'type':'memory_store','memory_store_id':E['MEMORY_STORE_ID'],'access':'read_write','instructions':'Brand memory. Read/update brands/<slug>.md. Do not touch rotation.md.'}]
    s=call('POST','/sessions',body); sid=s['id']; print(case,sid,flush=True)
    t0=time.time()
    while True:
        time.sleep(15); s=call('GET',f'/sessions/{sid}')
        if s['status'] in ('idle','terminated') and time.time()-t0>30: break
        if time.time()-t0>1500: break
    ev=call('GET',f'/sessions/{sid}/events?beta=true&limit=1000').get('data',[])
    txt='\n'.join(c.get('text','') for e in ev if e['type']=='agent.message' and not e.get('session_thread_id') for c in e.get('content',[]))
    rep=None
    for m in reversed(re.findall(r'```json\s*([\s\S]*?)```',txt)):
        try: rep=json.loads(m); break
        except Exception: pass
    oe=s.get('outcome_evaluations') or [{}]
    exp=open(f'{case}/expected.md').read()
    cl=(rep or {}).get('claims',[])
    hit=[c for c in cl if c.get('verdict','').lower() in ('misleading','unsubstantiated')]
    target=cl[0] if cl else {}
    return {'case':case,'session_id':sid,'agent_version':int(E['V']),'status':s['status'],
            'grader_result':oe[-1].get('result'),'grader_explanation':(oe[-1].get('explanation') or '')[:1500],
            'cost_usd':int(s.get('usage',{}).get('list_cost',{}).get('amount',0))/100,'active_seconds':s.get('stats',{}).get('active_seconds'),
            'target_claim':target.get('claim'),'target_verdict':target.get('verdict'),'target_reason':target.get('reason'),'target_rule':target.get('rule'),
            'auto_pass':bool(target) and target.get('verdict','').lower() in ('misleading','unsubstantiated'),
            'claims':[{k:c.get(k) for k in ('claim','verdict','rule')} for c in cl]}
with cf.ThreadPoolExecutor(8) as x: res=list(x.map(run,sys.argv[1:]))
out=f"results-v{E['V']}.json"; json.dump({'agent_id':E['JUDGE_ID'],'agent_version':int(E['V']),'run_at':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'results':res},open(out,'w'),indent=2)
for r in res: print(r['case'],'PASS' if r['auto_pass'] else 'FAIL',r['target_verdict'],r['grader_result'],'$%.2f'%r['cost_usd'])
PY
