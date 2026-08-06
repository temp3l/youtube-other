import { describe, expect, it } from "vitest";
import {
  planHistoryGeoV31,
  validateHistoryGeoV31Plan,
  type AcceptedGeoEntity,
  type GeoClaim,
} from "./history-geo-v31.js";

const entities: AcceptedGeoEntity[] = [
  {
    id: "place-moscow",
    canonicalName: "Moscow",
    type: "place",
    sourceUnitIds: ["unit-1"],
  },
  {
    id: "place-borodino",
    canonicalName: "Borodino",
    type: "place",
    sourceUnitIds: ["unit-1"],
  },
  {
    id: "place-rome",
    canonicalName: "Rome",
    type: "place",
    sourceUnitIds: ["unit-2"],
  },
  {
    id: "place-italy",
    canonicalName: "Italy",
    type: "place",
    sourceUnitIds: ["unit-2"],
  },
  {
    id: "place-florence",
    canonicalName: "Florence",
    type: "place",
    sourceUnitIds: ["unit-3"],
  },
  {
    id: "place-siena",
    canonicalName: "Siena",
    type: "place",
    sourceUnitIds: ["unit-3"],
  },
  {
    id: "actor-napoleon",
    canonicalName: "Napoleon",
    type: "person",
    sourceUnitIds: ["unit-1"],
  },
  {
    id: "actor-rome",
    canonicalName: "Roman state",
    type: "state-or-polity",
    sourceUnitIds: ["unit-2", "unit-4"],
  },
  {
    id: "period-1",
    canonicalName: "1812 CE",
    type: "date-or-period",
    sourceUnitIds: ["unit-1"],
  },
  {
    id: "period-2",
    canonicalName: "200 BCE",
    type: "date-or-period",
    sourceUnitIds: ["unit-2"],
  },
  {
    id: "period-3",
    canonicalName: "1348 CE",
    type: "date-or-period",
    sourceUnitIds: ["unit-3"],
  },
];
const claims: GeoClaim[] = [
  {
    id: "claim-campaign",
    text: "In 1812 CE Napoleon advanced from Borodino to Moscow; supply distance constrained the campaign.",
    unitIds: ["unit-1"],
  },
  {
    id: "claim-territory",
    text: "In 200 BCE the Roman state expanded territorial control from Rome across Italy.",
    unitIds: ["unit-2"],
  },
  {
    id: "claim-disease",
    text: "In 1348 CE disease spread from Florence to Siena, and mortality reduced labour supply.",
    unitIds: ["unit-3"],
  },
  {
    id: "claim-fiscal",
    text: "Roman state tax revenue strengthened political authority.",
    unitIds: ["unit-4"],
  },
];

describe("history geo v3.1", () => {
  it("creates typed semantic maps and domain diagrams only from accepted entities and claims", () => {
    const plan = planHistoryGeoV31({
      narration: claims.map((claim) => claim.text).join(" "),
      entities,
      claims,
    });
    expect(plan.mapStates.map((state) => state.movements[0]!.kind)).toEqual([
      "campaign",
      "territorial-change",
      "disease-spread",
    ]);
    expect(
      plan.mapStates.map((state) => state.routes[0]!.fromEntityId)
    ).toEqual(["place-borodino", "place-rome", "place-florence"]);
    expect(
      plan.mapMasters.every(
        (master) =>
          master.baseGeographicExtent &&
          master.projection &&
          master.supportedRatios[1] === "9:16"
      )
    ).toBe(true);
    expect(plan.diagramStates.map((state) => state.domain)).toEqual([
      "logistics",
      "fiscal-political",
      "disease-demographic-labour",
    ]);
    expect(
      plan.diagnostics.filter((item) => item.severity === "error")
    ).toEqual([]);
  });
  it("reports invalid route endpoints, movement without routes, and raw-id labels", () => {
    const plan = planHistoryGeoV31({
      narration: claims[0]!.text,
      entities,
      claims: [claims[0]!],
    });
    const broken = {
      ...plan,
      mapStates: [
        {
          ...plan.mapStates[0]!,
          title: "Army advance",
          routes: [],
          movements: [
            {
              kind: "campaign" as const,
              routeIds: [],
              claimIds: ["claim-campaign"],
            },
          ],
        },
      ],
      diagramStates: [
        {
          ...plan.diagramStates[0]!,
          nodes: [
            { ...plan.diagramStates[0]!.nodes[0]!, label: "entity-123" },
            ...plan.diagramStates[0]!.nodes.slice(1),
          ],
        },
      ],
    };
    const codes = validateHistoryGeoV31Plan(broken, entities, [claims[0]!]).map(
      (item) => item.code
    );
    expect(codes).toContain("MOVEMENT_WITHOUT_ROUTE");
    expect(codes).toContain("DIAGRAM_NODE_SEMANTICS_INCOMPLETE");
  });
});
