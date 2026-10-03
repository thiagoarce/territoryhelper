import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertEq, assertTrue, test } from "./harness";
import { parseCsv } from "../src/lib/installer/csv";
import {
  decodeCnefeBuffer,
  normalizeComparable,
  transformCnefeCsv,
} from "../src/lib/installer/cnefe";

const fixture = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "installer",
);

test("parser CSV preserva vírgula, quebra e aspas escapadas dentro de célula", () => {
  assertEq(parseCsv('A,B\n1,"Rua A, bloco ""B"""\n'), [
    ["A", "B"],
    ["1", 'Rua A, bloco "B"'],
  ]);
});

test("normalização mantém original fora da chave de comparação", () => {
  assertEq(
    normalizeComparable("Av. Pres. Epitácio Pessoa"),
    "AV PRES EPITACIO PESSOA",
  );
});

test("transformador CNEFE traduz código e preserva linha bruta", () => {
  const result = transformCnefeCsv(
    "ID;Logradouro;Numero;Complemento;Latitude;Longitude;Tipo Codigo\n1;Rua Açucena;20;Apto 1;-7,10;-34,80;01\n",
    "municipio.csv",
    {
      edition: "2022",
      delimiter: ";",
      aliases: {
        sourceId: ["ID"],
        street: ["Logradouro"],
        number: ["Numero"],
        complement: ["Complemento"],
        latitude: ["Latitude"],
        longitude: ["Longitude"],
        addressTypeCode: ["Tipo Codigo"],
      },
      dictionaries: {
        edition: "2022",
        fields: { addressTypeCode: { "01": "Domicílio particular" } },
      },
    },
  );
  assertEq(result.records.length, 1);
  assertEq(result.records[0].streetNormalized, "RUA ACUCENA");
  assertEq(result.records[0].addressTypeDescription, "Domicílio particular");
  assertEq(result.records[0].raw["Complemento"], "Apto 1");
  assertTrue(result.rejected.length === 0);
});

test("transformador rejeita coordenada inválida sem perder diagnóstico", () => {
  const result = transformCnefeCsv(
    "Logradouro,Numero,Latitude,Longitude\nRua A,1,999,-34\n",
    "invalid.csv",
    { edition: "2022" },
  );
  assertEq(result.records.length, 0);
  assertEq(result.rejected[0].reason, "invalid-coordinate");
});

test("transformador reconhece o esquema oficial CNEFE 2022 sem aliases manuais", () => {
  const input = readFileSync(resolve(fixture, "cnefe-2022.csv"), "utf8");
  const result = transformCnefeCsv(input, "cnefe-2022.csv", {
    edition: "CNEFE-2022",
  });

  assertEq(result.records.length, 3);
  assertEq(result.records[0].streetOriginal, "Rua Jardim Inventado");
  assertEq(result.records[0].sourceId, "FAKE-0001");
  assertTrue(result.records[0].recordId !== result.records[0].sourceId);
  assertEq(result.records[0].locality, "Bairro Inventado");
  assertEq(result.records[0].numberOriginal, "010");
  assertEq(result.records[0].numberModifier, "Fundos");
  assertEq(result.records[0].complementOriginal, "APTO 001");
  assertEq(result.records[0].addressTypeDescription, "Domicílio particular");
  assertEq(result.records[0].addressSubtypeDescription, "Apartamento");
  assertEq(result.records[1].streetOriginal, "Avenida Doutor Modelo");
  assertEq(result.records[1].complementOriginal, "BLOCO B");
  assertEq(result.records[1].addressSubtypeDescription, "Outros");
  assertEq(result.records[2].constructionPurposeDescription, "Residencial");
  assertEq(result.report.unknownCodes.addressSubtypeCode, ["999"]);
  assertEq(result.report.resolvedColumns.street, null);
  assertEq(result.report.resolvedColumns.streetName, "NOM_SEGLOGR");
});

test("decodificação automática aceita CSV oficial em Windows-1252", () => {
  const encoded = Buffer.from("Rua Ação", "latin1");
  assertEq(decodeCnefeBuffer(encoded), "Rua Ação");
});

test("código de endereço repetido não elimina registros CNEFE distintos", () => {
  const result = transformCnefeCsv(
    "ID;Logradouro;Numero;Complemento;Latitude;Longitude\nMESMO;Rua Modelo;10;Apto 1;-7.1;-34.8\nMESMO;Rua Modelo;10;Apto 2;-7.1;-34.8\n",
    "repeated-address.csv",
    { edition: "CNEFE-2022", delimiter: ";" },
  );

  assertEq(result.records.length, 2);
  assertEq(
    result.records.map((record) => record.sourceId),
    ["MESMO", "MESMO"],
  );
  assertTrue(result.records[0].recordId !== result.records[1].recordId);
});
