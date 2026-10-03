import { assertEq, test } from "./harness";
import { groupNormalizedAddresses } from "../src/lib/installer/group";
import type { NormalizedCnefeAddress } from "../src/lib/installer/types";

function address(
  sourceId: string,
  complement: string | null,
  overrides: Partial<NormalizedCnefeAddress> = {},
): NormalizedCnefeAddress {
  const result: NormalizedCnefeAddress = {
    schemaVersion: "1.1.0",
    sourceEdition: "2022",
    sourceFile: "fixture.csv",
    sourceRow: 2,
    sourceId,
    recordId: sourceId,
    municipalityCode: "2507507",
    municipalityName: "João Pessoa",
    streetOriginal: "Rua Exemplo",
    streetNormalized: "RUA EXEMPLO",
    numberOriginal: "100",
    numberNormalized: "100",
    numberModifier: null,
    complementOriginal: complement,
    complementNormalized: complement?.toUpperCase() ?? null,
    latitude: -7.1,
    longitude: -34.8,
    addressTypeCode: "01",
    addressTypeDescription: "Domicílio particular",
    addressSubtypeCode: null,
    addressSubtypeDescription: null,
    establishmentName: null,
    establishmentIndicatorCode: null,
    establishmentIndicatorDescription: null,
    constructionIndicatorCode: null,
    constructionIndicatorDescription: null,
    constructionPurposeCode: null,
    constructionPurposeDescription: null,
    geocodingLevelCode: null,
    geocodingLevelDescription: null,
    locality: null,
    postalCode: null,
    censusSector: "001",
    censusBlock: "002",
    censusFace: "003",
    raw: { ID: sourceId },
  };
  return { ...result, ...overrides };
}

test("agrupamento transforma várias unidades do mesmo número em um prédio estável", () => {
  const groups = groupNormalizedAddresses([
    address("a", "Apto 101"),
    address("b", "Apto 102"),
  ]);
  assertEq(groups.length, 1);
  assertEq(groups[0].type, "predio");
  assertEq(
    groups[0].units.map((unit) => unit.sourceId),
    ["a", "b"],
  );
});

test("identificador do local não depende da ordem das unidades", () => {
  const a = groupNormalizedAddresses([address("a", "Casa")])[0].sourceId;
  const b = groupNormalizedAddresses([address("b", "Outro complemento")])[0]
    .sourceId;
  assertEq(a, b);
});

test("mesmo logradouro e número em setores diferentes não são mesclados", () => {
  const groups = groupNormalizedAddresses([
    address("a", null, { censusSector: "001" }),
    address("b", null, { censusSector: "002" }),
  ]);
  assertEq(groups.length, 2);
});

test("endereços sem número usam o código oficial para não unir pontos distintos", () => {
  const groups = groupNormalizedAddresses([
    address("endereco-a", null, {
      numberOriginal: "SN",
      numberNormalized: "SN",
      latitude: -7.1,
    }),
    address("endereco-b", null, {
      numberOriginal: "SN",
      numberNormalized: "SN",
      latitude: -7.2,
    }),
  ]);
  assertEq(groups.length, 2);
});

test("apartamentos prevalecem sobre comércio incidental no mesmo prédio", () => {
  const groups = groupNormalizedAddresses([
    address("apartamento", "Apto 101", {
      addressTypeCode: "1",
      addressSubtypeCode: "103",
      addressSubtypeDescription: "Apartamento",
    }),
    address("loja", null, {
      addressTypeCode: "6",
      addressTypeDescription: "Estabelecimento de outras finalidades",
    }),
  ]);
  assertEq(groups[0].type, "predio");
});

test("coordenada do local é a média estável das unidades", () => {
  const groups = groupNormalizedAddresses([
    address("b", null, { latitude: -7.2, longitude: -34.9 }),
    address("a", null, { latitude: -7.0, longitude: -34.7 }),
  ]);
  assertEq(groups[0].latitude, -7.1);
  assertEq(groups[0].longitude, -34.8);
  assertEq(
    groups[0].units.map((unit) => unit.sourceId),
    ["a", "b"],
  );
});
