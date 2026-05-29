# PM placement Monte Carlo simulation:
cd /data/work/Experiments/tasks/nback && npx vitest run pm-placement-sim.test.ts --reporter=verbose

# Code to build and copy (change paths):
cd /data/work/Experiments & npm run build -w @experiments/web && rsync -av --delete /data/work/Experiments/apps/web/dist/ /data/work/jatos/study_assets_root/annikaHons/
cd /data/work/Experiments & npm run build -w @experiments/web && rsync -av --delete /data/work/Experiments/apps/web/dist/ /data/work/jatos/study_assets_root/evanderHons/
For JATOS deployment, make a single component, add the repo directory with the above commands, set the html to index.html and the component json to:
```
{
  "taskId": "nback",
  "variantId": "annikaHons",
  "auto": true,
  "overrides": {
    "data": {
      "localSave": false
    }
  }
}
```
Replacing the values as required. Disabling local save ensures no csv is downloaded on the participant side.

# JATOS test auto
# Annika
pm2 start node --name autoresponder-jatos-once --no-autorestart --     scripts/run-autoresponder-url.mjs     --url "http://127.0.0.1:9000/publix/Jbc32w1CK6N?auto=true&auto_mode=data-only"     --max-minutes 130     --done-text "Thank you very much for participating"
# Evander
pm2 start node --name autoresponder-jatos-once --no-autorestart --     scripts/run-autoresponder-url.mjs     --url "http://127.0.0.1:9000/publix/fR36PYJ0B7d?auto=true&auto_mode=data-only"     --max-minutes 130     --done-text "Thank you very much for participating"

pm2 status autoresponder-jatos-once
pm2 logs autoresponder-jatos-once --lines 10 --nostream
# Code to run bricks difficulty estimate (from root):
npm run difficulty -w @experiments/task-bricks -- \
    --config evanderHons --trials 10000 --seed 123456 \
    --no-by-trial-type --no-by-block-trial-type
# Update sprite images
python3 tasks/bricks/scripts/update-manifests.py
python3 tasks/bricks/scripts/trim-sprites.py --thresh 1
https://www.remove.bg/upload

# Code to extract csv from json
python scripts/jatos_to_long_csv.py temp/annikaHons_jatos_example.txt temp/annikaHons_jatos_example_long.csv
# Experiments Workspace

# Code to sanity-test nback stimuli
python scripts/validate_stimuli_rules.py temp/test_stimuli.csv --max-print 10

Unified experiment framework with a shared TypeScript core and task adapters.
