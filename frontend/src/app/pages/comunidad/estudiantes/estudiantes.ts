import { Component } from '@angular/core';
import { PersonasModuloComponent, PersonasModuloConfig } from '../../../shared/personas-modulo/personas-modulo';

@Component({
  selector: 'app-estudiantes',
  standalone: true,
  imports: [PersonasModuloComponent],
  template: `<app-personas-modulo [cfg]="cfg"/>`,
})
export class EstudiantesPage {
  readonly cfg: PersonasModuloConfig = {
    tipo:           'estudiantes',
    tipoOtro:       'padres',
    pk:             'idestudiantes',
    titulo:         'Estudiantes',
    subtitulo:      'Registro de estudiantes con sus padres de familia o encargados',
    singular:       'estudiante',
    singularOtro:   'padre de familia',
    tituloVinculos: 'Padres / encargados',
  };
}
