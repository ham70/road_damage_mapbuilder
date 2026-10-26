Road Damage Heatmap
A browser based prototype for exploring road condition data collected during a drive. It combines GPS locations with accelerometer readings, identifies candidate acceleration spikes, and displays those candidates along the recorded route.

Currently A detected spike is only classified as a candidate event. Acceleration can also change because of braking, turning, vehicle motion, or sensor placement.

What the map shows
The route line follows the GPS coordinates from the location CSV.
The line color represents the metric selected in the Column menu. 
The red Markers show candidate accelerometer spikes matched to nearby GPS samples. Click a marker for the spike time and GPS time difference.
The current road damage detector calculates acceleration magnitude from X/Y/Z, compares it with a rolling median baseline, and only marks events with a GPS sample within 1.5 seconds.

Requirements

Node.js LTS
A browser
Internet access for the OpenFreeMap basemap tiles

How to Run locally
First instal dependencies

Inside powershell
npm.cmd install

Then start the development server
npm.cmd run dev

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
