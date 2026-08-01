import { assertEq, test } from './harness';
import { groupNormalizedAddresses } from '../src/lib/installer/group';
import type { NormalizedCnefeAddress } from '../src/lib/installer/types';

function address(sourceId: string, complement: string | null): NormalizedCnefeAddress {
  return {
    schemaVersion: '1.0.0', sourceEdition: '2022', sourceFile: 'fixture.csv', sourceRow: 2,
    sourceId, municipalityCode: '2507507', municipalityName: 'João Pessoa',
    streetOriginal: 'Rua Exemplo', streetNormalized: 'RUA EXEMPLO',
    numberOriginal: '100', numberNormalized: '100',
    complementOriginal: complement, complementNormalized: complement?.toUpperCase() ?? null,
    latitude: -7.1, longitude: -34.8, addressTypeCode: '01',
    addressTypeDescription: 'Domicílio particular', locality: null, postalCode: null,
    censusSector: '001', censusBlock: '002', censusFace: '003', raw: { ID: sourceId }
  };
}

test('agrupamento transforma várias unidades do mesmo número em um prédio estável', () => {
  const groups = groupNormalizedAddresses([address('a', 'Apto 101'), address('b', 'Apto 102')]);
  assertEq(groups.length, 1);
  assertEq(groups[0].type, 'predio');
  assertEq(groups[0].units.map((unit) => unit.sourceId), ['a', 'b']);
});

test('identificador do local não depende da ordem das unidades', () => {
  const a = groupNormalizedAddresses([address('a', 'Casa')])[0].sourceId;
  const b = groupNormalizedAddresses([address('b', 'Outro complemento')])[0].sourceId;
  assertEq(a, b);
});
