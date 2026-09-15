# Product Context

## Product

DriveScope is a Tesla vehicle monitoring and analytics application. It collects vehicle data through the Tesla Fleet API, stores normalized current and historical information in Supabase, and provides a modern application UI for understanding vehicle activity.

The product should provide functionality comparable to TeslaMate in data coverage and analytics, but it must not reproduce TeslaMate's Grafana-style interface. TeslaMate is a functional reference, not a visual or architectural template.

## Product areas

- Current vehicle state and telemetry.
- Drives, drive details, drive statistics, routes, efficiency, and energy use.
- Charging sessions, charging details, charging statistics, power, cost, and location.
- Battery level, battery health, projected range, and vampire drain.
- Mileage, efficiency, locations, visited places, trips, and timeline.
- Vehicle states, software updates, general statistics, and API diagnostics.

## Product philosophy

This is primarily a data and analytics platform. Vehicle controls are not a primary feature. Prefer trustworthy history, clear provenance, useful comparisons, and honest unavailable states over speculative automation or decorative UI.

The application should help answer:

- What is my Tesla doing right now?
- Where is it?
- What happened during my last drive?
- How much energy did I use?
- Where did I charge and how much did charging cost?
- How is battery health changing?
- How much battery does the vehicle lose while parked?
- Where has the vehicle been?
- What happened to the vehicle today?

## Product boundaries

- Do not make controls the center of the product without an explicit requirement.
- Do not fabricate telemetry, addresses, energy, routes, or health conclusions.
- A provider value, normalized value, and derived analytic must remain distinguishable.
- A sleeping or unavailable vehicle is a valid state, not automatically an error.
- The UI should favor actionable summaries and drill-down analytics rather than a collection of giant KPI cards.
