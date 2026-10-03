import { Component } from '@angular/core';
import { PersonasModuloComponent, PersonasModuloConfig } from '../../../shared/personas-modulo/personas-modulo';

@Component({
  selector: 'app-padres',
  standalone: true,
  imports: [PersonasModuloComponent],
  template: `<app-personas-modulo [cfg]="cfg"/>`,
})
export class PadresPage {
  readonly cfg: PersonasModuloConfig = {
    tipo:           'padres',
    tipoOtro:       'estudiantes',
    pk:             'idpadres',
    titulo:         'Padres de familia',
    subtitulo:      'Registro de padres, madres y encargados con sus estudiantes asignados',
    singular:       'padre de familia',
    singularOtro:   'estudiante',
    tituloVinculos: 'Estudiantes',
  };
}
