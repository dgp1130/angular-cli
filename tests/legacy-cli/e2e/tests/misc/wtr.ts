import { writeMultipleFiles, replaceInFile } from '../../utils/fs';
import { ng } from '../../utils/process';
import { expectToFail } from '../../utils/utils';

export default async function () {
  await replaceInFile(
    'angular.json',
    '@angular-devkit/build-angular:karma',
    '@angular-devkit/build-angular:wtr',
  );

  await ng('test');
}
