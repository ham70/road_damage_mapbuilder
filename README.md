Road Damage Heatmap
A browser based prototype for exploring road condition data collected during a drive. It combines GPS locations with accelerometer readings, identifies candidate acceleration spikes, and displays those candidates along the recorded route.

Currently A detected spike is only classified as a candidate event. Acceleration can also change because of braking, turning, vehicle motion, or sensor placement.

What the map shows
The route line follows the GPS coordinates from the location CSV.
The line color represents what is selected in the Color by menu: either a computed score (see Scoring functions below) or a raw CSV column.
The red Markers show candidate accelerometer spikes matched to nearby GPS samples. Click a marker for the spike time and GPS time difference.
The current road damage detector calculates acceleration magnitude from X/Y/Z, compares it with a rolling median baseline, and only marks events with a GPS sample within 1.5 seconds.

Requirements

Node.js LTS
A browser
Internet access for the OpenFreeMap basemap tiles

How to clean environment
PS C:\Users\username\...\road_damage_mapbuilder> if (Test-Path .\node_modules) {
  Remove-Item -LiteralPath .\node_modules -Recurse -Force
}

How to Run locally
Make sure file path is something similar to 
PS C:\Users\username\...\road_damage_mapbuilder>
First install dependencies

Inside powershell
PS C:\Users\username\...\road_damage_mapbuilder> npm.cmd install

Then start the development server
PS C:\Users\username\...\road_damage_mapbuilder> npm.cmd run dev

Open the local URL printed in the terminal, usually something like http://localhost:5173/.

In the app, choose Open CSV(s) and select Accelerometer.csv and Location.csv together. The app needs both files to calculate and map candidate spikes. The status area reports how many GPS points and candidate spikes were loaded.


CSV expectations

Each file starts with a Time (s) column. 
The location file also needs latitude and longitude columns. 
The accelerometer file needs these columns for the current spike detector:

- X (m/s^2)
- Y (m/s^2)
- Z (m/s^2)

The two files time values must refer to the same time origin for the GPS matching to be meaningful. The location file supplies the route coordinates; accelerometer samples are analyzed at their original sampling rate, then each candidate spike is associated with the nearest GPS sample within the allowed time difference.


Scoring functions

Scores are derived values that color the route, such as vibration computed from X/Y/Z. Each score is one file in src/scoring/scorers/. Every file there is picked up automatically and listed under "Scores" in the Color by menu, ordered by file name (the number prefixes set the order).

To add one, create src/scoring/scorers/50-my-score.ts:

    import { defineScorer } from '../types';
    import { detrend, magnitude, reduce } from '../helpers';

    export default defineScorer({
      label: 'My score',
      description: 'One sentence shown under the legend title.',
      compute(ctx) {
        const total = magnitude(ctx.series('X (m/s^2)'), ctx.series('Y (m/s^2)'), ctx.series('Z (m/s^2)'));
        return ctx.perPoint(detrend(total, 1), reduce.rms);
      },
    });

compute(ctx) must return one number (or null) per GPS point. Higher means rougher. What ctx provides (src/scoring/types.ts):

- ctx.series('Y') is a raw column at its native sample rate (about 10 Hz for the accelerometer). Names ignore case, and the unit is optional ('Y' or 'Y (m/s^2)'). When two files share a header, prefix the start of the file name: 'Accelerometer: X'.
- ctx.perPoint(series, reducer) collapses a native-rate series to one value per GPS point. Each point gets the samples between it and halfway to its neighbours, so short spikes are kept.
- ctx.column('Velocity') is a column already resampled to one value per GPS point. Fine for GPS fields; avoid it for accelerometer data, because interpolating onto ~1 Hz GPS times drops spikes.
- ctx.has('name') checks for an optional input. ctx.time, ctx.lat and ctx.lon give the GPS points.

Helpers in src/scoring/helpers.ts:

- magnitude(...series): sqrt(x² + y² + ...) per sample
- derivative(series): change per second, e.g. jerk
- detrend(series, seconds): subtract a rolling median, removing gravity and slow changes
- combine(fn, ...series), map(series, fn): build any other per-sample formula
- reduce.max / min / maxAbs / mean / rms / std / range: reducers for perPoint

If a score asks for a column the loaded files don't have, it is quietly left out of the menu (the reason is logged in the browser console). If it throws an error or returns the wrong number of values, it is left out and the error appears in the status bar. Either way, the other scores still load.

Run the tests with npm test (npm.cmd test in PowerShell).
