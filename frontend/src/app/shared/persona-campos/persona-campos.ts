import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EstadoCivil, PersonaDatos } from '../../models';

export type PersonaForm = Required<Omit<PersonaDatos, 'idestados_civiles'>> & { idestados_civiles: number | null };

export function personaFormVacio(): PersonaForm {
  return {
    primer_nombre: '', segundo_nombre: '', primer_apellido: '', segundo_apellido: '', apellido_casada: '',
    fecha_nacimiento: '', lugar_nacimiento: '', dpi: '', codigo_mineduc: '', direccion: '', telefono_casa: '', telefono_celular: '',
    idestados_civiles: null, nacionalidad: 'Guatemalteca', nit: '', pasaporte: '', email: '',
  };
}

/**
 * Campos de datos personales comunes a Padres de familia, Estudiantes y
 * Personal docente. Padres y docentes muestran además apellido de casada, NIT,
 * pasaporte, estado civil y nacionalidad; el estudiante, CUI obligatorio y
 * código MINEDUC; el padre, su correo (aviso de inscripción y comprobantes de pago;
 * el docente tiene su propio campo de correo en su página).
 * Se usa tanto en el formulario principal como en los sub-formularios de
 * "nuevo padre / nuevo estudiante" dentro de las asignaciones.
 */
@Component({
  selector: 'app-persona-campos',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './persona-campos.html',
  styleUrl: './persona-campos.scss',
})
export class PersonaCamposComponent {
  @Input({ required: true }) model!: PersonaForm;
  @Input() tipo: 'padre' | 'estudiante' | 'docente' = 'padre';
  @Input() estadosCiviles: EstadoCivil[] = [];
  /** Campos cuyo valor viene heredado del registro principal (se resaltan). */
  @Input() heredados: Set<string> | null = null;
  /** Texto del origen de la herencia, ej. "del estudiante". */
  @Input() origenHerencia = '';
  /** Modo compacto: sin títulos de sección (sub-formulario). */
  @Input() compacto = false;

  /** El usuario editó a mano un campo (deja de sincronizarse con la herencia). */
  @Output() campoEditado = new EventEmitter<string>();

  readonly hoy = new Date().toISOString().substring(0, 10);

  // Docentes llevan los mismos datos que el padre de familia
  get esPadre(): boolean { return this.tipo !== 'estudiante'; }

  readonly nacionalidades = ['Guatemalteca', 'Salvadoreña', 'Hondureña', 'Mexicana', 'Nicaragüense', 'Costarricense', 'Beliceña', 'Estadounidense'];

  esHeredado(campo: string): boolean {
    return !!this.heredados?.has(campo);
  }

  onEdit(campo: string) {
    this.campoEditado.emit(campo);
  }

  /** Deja solo dígitos en el DPI (13 dígitos, CUI). */
  limpiarDpi() {
    this.model.dpi = (this.model.dpi || '').replace(/\D/g, '').substring(0, 13);
  }

  limpiarMineduc() {
    this.model.codigo_mineduc = (this.model.codigo_mineduc || '').toUpperCase().replace(/\s/g, '');
  }
}
