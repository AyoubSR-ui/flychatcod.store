import type { CarrierAdapter, CreateShipmentParams, ShipmentResult, ShipmentStatusResult, CancelShipmentResult, CarrierGeoData, CarrierCommune, CarrierDesk, CarrierFee, CarrierVerificationResult } from "./types.js";
import { getWilayaCode, resolveCommuneName } from "./wilaya-codes.js";
import { normalizeAlgerianPhone } from "./phone-format.js";

// ─── Ecotrack adapter (generic, per-tenant) ────────────────────────────────────
// Real field shape verified from the open-source PiteurStudio/CourierDZ client
// (EcotrackProviderIntegration.php) — not guessed, not from dzship's gateway
// docs. Ecotrack is a shared white-label platform: 20+ Algerian couriers run
// the exact same API on their own subdomain, so one adapter class parameterized
// by tenant domain covers all of them.
//
// Auth: `Authorization: Bearer {token}` header (single credential)
// Create: POST {tenantDomain}api/v1/create/order
//   Success check: response.success === true
// Label: GET {tenantDomain}api/v1/get/order/label?tracking={id} (raw PDF bytes)
// Track/status: NOT implemented in the reference client (throws "not
//   implemented" there too) — no verified endpoint for this yet.
// Cancel: no verified endpoint.
//
// Live: enabled 2026-07-29, explicitly requested and accepted as a real-world
// risk (field shape cross-referenced from CourierDZ, not verified against
// Ecotrack's actual live behavior; no confirmed cancel endpoint exists — a
// wrong first call may not be undoable via the API). Scoped to Ecotrack only;
// Noest/Maystro/ZR Express each have their own separate unresolved gaps and
// remain stubbed.

// Domains sourced from CourierDZ's ShippingProviders, then independently
// DNS-checked against all 22 (2026-07-29) — 2 of the 22 (anderson, world_express)
// had no DNS record at all under CourierDZ's domain and were corrected here
// to the real domains found via direct search + DNS/HTTP verification.
export const ECOTRACK_TENANTS: Record<string, { name: string; domain: string }> = {
  // CourierDZ's domain (anderson.ecotrack.dz) has no DNS record — corrected
  // to anderson-ecommerce.ecotrack.dz, verified via DNS + HTTP response.
  anderson_ecotrack: { name: "Anderson Delivery", domain: "https://anderson-ecommerce.ecotrack.dz/" },
  dhd: { name: "DHD", domain: "https://dhd.ecotrack.dz/" },
  areex: { name: "Areex", domain: "https://areex.ecotrack.dz/" },
  ba_consult: { name: "BA Consult", domain: "https://bacexpress.ecotrack.dz/" },
  conexlog: { name: "Conexlog", domain: "https://app.conexlog-dz.com/" },
  coyote_express: { name: "Coyote Express", domain: "https://coyoteexpressdz.ecotrack.dz/" },
  distazero: { name: "Distazero", domain: "https://distazero.ecotrack.dz/" },
  e48hr_livraison: { name: "48Hr Livraison", domain: "https://48hr.ecotrack.dz/" },
  fretdirect: { name: "FRET.Direct", domain: "https://fret.ecotrack.dz/" },
  golivri: { name: "GOLIVRI", domain: "https://golivri.ecotrack.dz/" },
  mono_hub: { name: "Mono Hub", domain: "https://mono.ecotrack.dz/" },
  msm_go: { name: "MSM Go", domain: "https://msmgo.ecotrack.dz/" },
  negmar_express: { name: "Negmar Express", domain: "https://negmar.ecotrack.dz/" },
  packers: { name: "Packers", domain: "https://packers.ecotrack.dz/" },
  prest: { name: "Prest", domain: "https://prest.ecotrack.dz/" },
  rb_livraison: { name: "RB Livraison", domain: "https://rblivraison.ecotrack.dz/" },
  rex_livraison: { name: "Rex Livraison", domain: "https://rex.ecotrack.dz/" },
  rocket_delivery: { name: "Rocket Delivery", domain: "https://rocket.ecotrack.dz/" },
  salva_delivery: { name: "Salva Delivery", domain: "https://salvadelivery.ecotrack.dz/" },
  speed_delivery: { name: "Speed Delivery", domain: "https://speeddelivery.ecotrack.dz/" },
  tsl_express: { name: "TSL Express", domain: "https://tsl.ecotrack.dz/" },
  // CourierDZ's domain (worldexpress.ecotrack.dz) has no DNS record —
  // corrected to world-express.ecotrack.dz (hyphenated), verified via DNS + HTTP.
  world_express: { name: "WorldExpress", domain: "https://world-express.ecotrack.dz/" },
};

// Several Ecotrack list endpoints return an object keyed by index
// (`{"0":{...},"1":{...}}`) instead of a plain JSON array — confirmed live on
// both get/communes and (nested under "livraison") get/fees. Object.values()
// on such an object yields the same ordering a real array would (integer-like
// keys iterate in ascending numeric order per the JS spec), so this is a safe
// normalization, not a guess at ordering.
function toArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

export class EcotrackAdapter implements CarrierAdapter {
  readonly carrier: string;
  private domain: string;

  constructor(tenantId: string, private credentials: { token: string }) {
    const tenant = ECOTRACK_TENANTS[tenantId];
    if (!tenant) throw new Error(`[Ecotrack] Unknown tenant "${tenantId}"`);
    this.carrier = tenantId;
    this.domain = tenant.domain;
  }

  private buildHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.credentials.token}`, "Content-Type": "application/json" };
  }

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    const url = `${this.domain}api/v1/create/order`;
    const headers = this.buildHeaders();
    const body = {
      reference: params.orderNumber,
      nom_client: `${params.customerFirstName} ${params.customerLastName}`.trim(),
      telephone: normalizeAlgerianPhone(params.customerPhone),
      telephone_2: params.customerPhone2 ? normalizeAlgerianPhone(params.customerPhone2) : "",
      adresse: params.address,
      commune: resolveCommuneName(params.toCommune, getWilayaCode(params.toWilaya)),
      code_wilaya: getWilayaCode(params.toWilaya),
      montant: params.price,
      remarque: params.note || "",
      produit: params.productList,
      stock: 0,
      type: params.hasExchange ? 2 : 1, // 1 = Livraison, 2 = Echange (NOT home/stopdesk — that's stop_desk below)
      stop_desk: params.isStopdesk ? 1 : 0,
    };

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Ecotrack (${this.carrier}) API error ${res.status}: ${errorText}`);
    }
    const data = await res.json() as any;
    if (data.success === false) {
      throw new Error(`Ecotrack (${this.carrier}) createShipment failed: ${data.message || JSON.stringify(data)}`);
    }
    // Exact response field name is unconfirmed (no live response seen yet) —
    // check the common candidates rather than assuming one.
    const trackingNumber = data.tracking ?? data.numero_suivi ?? data.id ?? data.order_id ?? data.numero ?? null;
    if (!trackingNumber) {
      throw new Error(`Ecotrack (${this.carrier}) createShipment succeeded but no tracking number field was recognized in the response: ${JSON.stringify(data)}`);
    }
    return { trackingNumber: String(trackingNumber), status: "label_created", raw: data };
  }

  async getStatus(trackingNumber: string): Promise<ShipmentStatusResult> {
    // The reference implementation has no track/status API endpoint for
    // Ecotrack at all (throws "not implemented" there too). Rather than block
    // tracking entirely, hand back Ecotrack's public web tracking page —
    // merchants can check status manually until the real API endpoint is
    // found and verified.
    return {
      status: "manual_tracking_required",
      raw: { trackingUrl: `https://ecotrack.dz/tracking/${trackingNumber}` },
    };
  }

  async cancelShipment(_trackingNumber: string): Promise<CancelShipmentResult> {
    throw new Error(`[Ecotrack:${this.carrier}] No verified cancel endpoint exists for the Ecotrack API yet.`);
  }

  // ─── Geo data: communes (+ stop-desk flag), desks, fees ──────────────────────
  // All three endpoints verified live against the Anderson tenant (2026-09)
  // with a real merchant token — not guessed, not from dzship's docs (which
  // have no such endpoints at all, see the earlier investigation). Since
  // Ecotrack tenants share one platform on their own subdomain, this is
  // expected to work unchanged for every tenant in ECOTRACK_TENANTS; only
  // Anderson has actually been probed live so far.
  //
  // GET api/v1/get/communes -> NOT a plain array — an object keyed by index:
  //   {"0":{nom,wilaya_id,code_postal,has_stop_desk}, "1":{...}, ...}
  //   has_stop_desk is 0/1, not a boolean. Confirmed live (production, 2026-09):
  //   the first deploy assumed a plain array here and silently produced zero
  //   communes — Array.isArray() on an index-keyed object is false, so the
  //   whole list was dropped with no error. toArray() below normalizes it.
  // GET api/v1/get/desks    -> { my_desk, other_desks }. Exact shape confirmed
  //   live (Anderson, 2026-09):
  //     my_desk: { hub_id, hub_name, location: { wilaya, commune, adresse,
  //                phone, phone2, email, map }, working_hours: [] }
  //     other_desks: [ same shape, array ]
  //   `my_desk` is a single object (the merchant's own hub), not an array —
  //   distinct from `other_desks`, the rest of the carrier's network. This
  //   shape parsed correctly from the first deploy — not touched here.
  // GET api/v1/get/fees     -> NOT a bare array either — the array is nested
  //   under a "livraison" key: {"livraison":[{wilaya_id,tarif,tarif_stopdesk}, ...]}.
  //   Same silent-zero bug as communes, confirmed live 2026-09.
  async getGeoData(): Promise<CarrierGeoData> {
    const headers = this.buildHeaders();

    const [communesRes, desksRes, feesRes] = await Promise.all([
      fetch(`${this.domain}api/v1/get/communes`, { headers }),
      fetch(`${this.domain}api/v1/get/desks`, { headers }),
      fetch(`${this.domain}api/v1/get/fees`, { headers }),
    ]);

    for (const [label, res] of [["communes", communesRes], ["desks", desksRes], ["fees", feesRes]] as const) {
      if (!res.ok) {
        throw new Error(`Ecotrack (${this.carrier}) get/${label} failed: ${res.status} ${await res.text()}`);
      }
    }

    const communesRaw = (await communesRes.json()) as any;
    const desksRaw = (await desksRes.json()) as any;
    const feesRaw = (await feesRes.json()) as any;

    const communes: CarrierCommune[] = toArray(communesRaw)
      .map((c): CarrierCommune => ({
        name: String(c.nom ?? c.name ?? ""),
        wilayaCode: Number(c.wilaya_id ?? c.wilayaId ?? 0),
        postalCode: c.code_postal != null ? String(c.code_postal) : undefined,
        hasStopDesk: c.has_stop_desk === true || c.has_stop_desk === 1 || c.has_stop_desk === "1",
      }))
      .filter((c) => c.name && c.wilayaCode > 0);

    const parseDesk = (d: any, isOwn: boolean): CarrierDesk => {
      const location = d?.location ?? {};
      return {
        id: d?.hub_id != null ? String(d.hub_id) : undefined,
        name: String(d?.hub_name ?? ""),
        wilaya: location.wilaya != null ? String(location.wilaya) : undefined,
        commune: location.commune != null ? String(location.commune) : undefined,
        address: location.adresse != null ? String(location.adresse) : undefined,
        phone: location.phone != null ? String(location.phone) : undefined,
        phone2: location.phone2 != null ? String(location.phone2) : undefined,
        email: location.email != null ? String(location.email) : undefined,
        mapLink: location.map != null ? String(location.map) : undefined,
        workingHours: Array.isArray(d?.working_hours) ? d.working_hours : undefined,
        isOwn,
        raw: d,
      };
    };
    // my_desk is a single object, not an array — the merchant's own hub.
    const otherDeskList: any[] = Array.isArray(desksRaw?.other_desks) ? desksRaw.other_desks : [];
    const desks: CarrierDesk[] = [
      ...(desksRaw?.my_desk ? [parseDesk(desksRaw.my_desk, true)] : []),
      ...otherDeskList.map((d) => parseDesk(d, false)),
    ].filter((d) => d.id || d.name);

    // The array lives under "livraison" — fall back to treating the whole
    // body as array-like if that key is ever absent, rather than assuming
    // the nesting is permanent.
    const fees: CarrierFee[] = toArray(feesRaw?.livraison ?? feesRaw)
      .map((f): CarrierFee => ({
        wilayaCode: Number(f.wilaya_id ?? f.wilayaId ?? 0),
        tarif: Number(f.tarif ?? 0),
        tarifStopdesk: f.tarif_stopdesk != null ? Number(f.tarif_stopdesk) : undefined,
      }))
      .filter((f) => f.wilayaCode > 0);

    return { communes, desks, fees };
  }

  // ─── Connection verification ─────────────────────────────────────────────────
  // GET api/v1/validate/token?api_token={token} — a read-only token check, never
  // a parcel creation or anything else that mutates carrier-side state.
  //
  // Auth here is a QUERY PARAM, not the Authorization: Bearer header every other
  // call on this adapter uses — this endpoint is a documented exception (see the
  // carrier honesty audit's ZR Express research, which found the same pattern
  // independently verified against Ecotrack's own validate/token endpoint in a
  // third-party live-tested integration). Response contract as specified:
  //   success:true + message "VALID_TOKEN"        -> verified
  //   message "INVALID_TOKEN" or "TOKEN_NOT_ALLOWED" -> failed, bad credentials
  // Anything else (unexpected shape, 5xx, timeout, network failure) is reported
  // as "unverified" rather than guessed either way — a probe that can't tell
  // must never claim it can.
  async verifyConnection(): Promise<CarrierVerificationResult> {
    const path = "api/v1/validate/token";
    const url = `${this.domain}${path}?api_token=${encodeURIComponent(this.credentials.token)}`;
    const started = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
      const latencyMs = Date.now() - started;

      let body: any = null;
      try { body = await res.json(); } catch { /* non-JSON body — handled below via res.status/marker fallback */ }
      const marker = typeof body?.message === "string" ? body.message : undefined;

      if (res.status === 429 || (marker && /too many attempts/i.test(marker))) {
        return {
          status: "unverified", probePath: path, httpStatus: res.status, carrierErrorCode: marker ?? null,
          message: "Ecotrack rate-limited this check — try again shortly.",
          failureReason: "rate_limited", latencyMs,
        };
      }
      if (res.ok && body?.success === true && marker === "VALID_TOKEN") {
        return {
          status: "verified", probePath: path, httpStatus: res.status, carrierErrorCode: marker,
          message: "Token verified against Ecotrack.", latencyMs,
        };
      }
      if (marker === "INVALID_TOKEN" || marker === "TOKEN_NOT_ALLOWED") {
        return {
          status: "failed", probePath: path, httpStatus: res.status, carrierErrorCode: marker,
          message: marker === "INVALID_TOKEN"
            ? "Ecotrack rejected this token as invalid."
            : "Ecotrack says this token isn't allowed to use the API.",
          failureReason: "invalid_credentials", latencyMs,
        };
      }
      if (res.status >= 500) {
        return {
          status: "unverified", probePath: path, httpStatus: res.status, carrierErrorCode: marker ?? null,
          message: `Ecotrack returned a server error (HTTP ${res.status}) — couldn't confirm the token either way.`,
          failureReason: "carrier_outage", latencyMs,
        };
      }
      return {
        status: "unverified", probePath: path, httpStatus: res.status, carrierErrorCode: marker ?? null,
        message: `Unrecognized response from Ecotrack's token check (HTTP ${res.status}).`,
        failureReason: "unknown_error", latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - started;
      if (err?.name === "AbortError") {
        return {
          status: "unverified", probePath: path, httpStatus: null, carrierErrorCode: null,
          message: "Ecotrack didn't respond within 10 seconds.",
          failureReason: "timeout", latencyMs,
        };
      }
      return {
        status: "unverified", probePath: path, httpStatus: null, carrierErrorCode: null,
        message: `Couldn't reach Ecotrack: ${err?.message || String(err)}`,
        failureReason: "carrier_outage", latencyMs,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
