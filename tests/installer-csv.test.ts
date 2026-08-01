import { assertEq, assertTrue, test } from './harness';
import { parseCsv } from '../src/lib/installer/csv';
import { normalizeComparable, transformCnefeCsv } from '../src/lib/installer/cnefe';

test('parser CSV preserva vírgula, quebra e aspas escapadas dentro de célula', () => {
  assertEq(parseCsv('A,B\n1,"Rua A, bloco ""B"""\n'), [['A', 'B'], ['1', 'Rua A, bloco "B"']]);
});

test('normalização mantém original fora da chave de comparação', () => {
  assertEq(normalizeComparable('Av. Pres. Epitácio Pessoa'), 'AV PRES EPITACIO PESSOA');
});

test('transformador CNEFE traduz código e preserva linha bruta', () => {
  const result = transformCnefeCsv(
    'ID;Logradouro;Numero;Complemento;Latitude;Longitude;Tipo Codigo\n1;Rua Açucena;20;Apto 1;-7,10;-34,80;01\n',
    'municipio.csv',
    {
      edition: '2022', delimiter: ';',
      aliases: { sourceId: ['ID'], street: ['Logradouro'], number: ['Numero'], complement: ['Complemento'], latitude: ['Latitude'], longitude: ['Longitude'], addressTypeCode: ['Tipo Codigo'] },
      dictionaries: { edition: '2022', fields: { addressTypeCode: { '01': 'Domicílio particular' } } }
    }
  );
  assertEq(result.records.length, 1);
  assertEq(result.records[0].streetNormalized, 'RUA ACUCENA');
  assertEq(result.records[0].addressTypeDescription, 'Domicílio particular');
  assertEq(result.records[0].raw['Complemento'], 'Apto 1');
  assertTrue(result.rejected.length === 0);
});

test('transformador rejeita coordenada inválida sem perder diagnóstico', () => {
  const result = transformCnefeCsv('Logradouro,Numero,Latitude,Longitude\nRua A,1,999,-34\n', 'invalid.csv', { edition: '2022' });
  assertEq(result.records.length, 0);
  assertEq(result.rejected[0].reason, 'invalid-coordinate');
});
