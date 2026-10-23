- Keep counting-cycle mutations in `src/lib/ciclos.ts` and cycle controls in `CiclosContagem`; deleting a cycle must not mutate independently stored Safe Zone records.
- Derive line/group selections from the address base in `ciclos.ts`; selection cycles reuse the Padrão slot and the existing counting exports so limits and finalization remain consistent.

- Keep institutional branding in global semantic tokens and shared UI primitives; the main route owns the responsive navigation shell so all operational tabs remain visually consistent without changing their domain logic.

- Validate shared function passwords exclusively on the server and persist verified roles in encrypted HTTP-only sessions; all shared app state must pass through session-authorized server functions because menu visibility alone cannot protect data.
- Use Secure, HttpOnly, SameSite=None partitioned access cookies with CSRF protection and verify persistence after unlock; failed cloud hydration must block operational controls rather than present missing data as empty state.
- Keep Conferência separate from stock counting; this surface is reserved for sold-material verification and must not reuse counting workflows without explicit requirements.
- Store each sales verification as an independent insert-only record with an idempotent request ID, allowing only explicit manager-authorized individual deletion; dedicated role-checked server functions prevent operators from editing manager settings.
- Validate sales error-reason arrays in the shared server input schema and derive manager comments from all stored reasons and seller; preserve legacy single-reason records without inventing missing reasons.
- Store seller sales counts independently by seller and period to avoid overwriting another seller's settings; derive manager and PDF metrics from the same shared calculations.
- Generate executive sales PDFs in a dedicated browser-safe module using global semantic report tokens to keep branding and pagination consistent.
- Derive weekly sales comparisons in a browser-safe pure module using São Paulo calendar days and all authorized sales records; keep the analysis dialog independent of the dashboard's month filter so adjacent weeks never lose records.
- Parse historical sales CSVs in a browser-safe shared module and revalidate them on a manager-authorized server function; use deterministic record identities for insert-only imports, preserve source timestamps and unknown fields, and derive channel independently from seller so historical records feed every existing metric.
- Deliveries and pickups use independent per-order records and role-checked server functions; managers are read-only on logistics operations. Pure modules derive delivery groups and transitions, while a privileged compare-and-swap RPC serializes group updates and verification/logistics inserts to avoid partial completion and concurrent capacity violations.
- Device delivery identity and display preferences are browser-only convenience values, never authorization; shared function sessions remain the sole permission boundary.
