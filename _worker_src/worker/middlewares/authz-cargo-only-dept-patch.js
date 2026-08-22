// =====================================================================
// authz-cargo-only-dept-patch.js — patch backend equivalente ao patch
// front lf-cargo-only-via-departamento-v1-20260804.
// ---------------------------------------------------------------------
// COMO APLICAR (backend Cloudflare Worker):
//   1) Copiar este arquivo para _worker_src/worker/middlewares/.
//   2) No middlewares/authz.js, ir até a função `resolveUserCaps`
//      (bloco "Resolve as caps do usuário", ~linha 260) e, LOGO DEPOIS
//      da linha `return base;` final, aplicar o passo:
//
//         return applyCargoOnlyDeptRule(base, raw, dbRow);
//
//      (`raw` = payload já autenticado do JWT; `dbRow` = linha bruta
//      do v_user_caps quando USE_DB_CAPS estiver ligado.)
//
//   Também aceito, se preferir tocar em UM único ponto:
//      import { wrapResolveUserCaps } from './authz-cargo-only-dept-patch.js';
//      export const resolveUserCaps = wrapResolveUserCaps(resolveUserCapsBase);
//
// REGRA (espelho da regra front):
//   • Hudson (role==='adm' ou uid==='adm')  -> mantém caps originais.
//   • Cargos gerente/gestor/representante/master/supervisor
//     SEM team_id / departamento_id no JWT  -> caps de consultor.
//   • Esses mesmos cargos COM team_id/departamento_id no JWT  ->
//     mantém escopo operacional (team/crud/edit/supervisorUI) MAS zera
//     adminUI automático. adminUI só permanece se `adm_extra=true` no
//     JWT ou `admin_ui=true` no v_user_caps (marcação manual do ADM).
// =====================================================================

const HIGH_ROLES = new Set(['gerente','gestor','representante','master','supervisor']);

const CAPS_BASIC_CONSULTOR = Object.freeze({
  escopo:'self', leads:'crud', negocios:'crud', foreign:'none',
  stageGated:false, adminUI:false, supervisorUI:false,
});

function _isRootAdm(raw){
  if(!raw) return false;
  if(raw.role==='adm') return true;
  if(raw.sub==='adm') return true;
  return false;
}

function _hasDept(raw, dbRow){
  if(raw && (raw.team_id || raw.teamId || raw.departamento_id || raw.departamentoId)) return true;
  if(dbRow && (dbRow.team_id || dbRow.departamento_id)) return true;
  return false;
}

function _hasAdmExtraManual(raw, dbRow){
  if(raw && (raw.adm_extra===true || raw.admExtra===true)) return true;
  if(dbRow && dbRow.admin_ui===true) return true;
  return false;
}

function _resolveCode(raw){
  if(!raw) return null;
  const cc = String(raw.cargo_codigo || raw.cargoCodigo || '').toLowerCase();
  if(cc) return cc;
  const c = String(raw.cargo || '').toLowerCase();
  const order = ['master','representante','gerente','gestor','administrativo',
                 'supervisor','orientador','funcionario','funcionário','consultor'];
  for(const k of order){
    if(c.indexOf(k)>=0) return k==='funcionário' ? 'funcionario' : k;
  }
  return null;
}

/**
 * Aplica a regra "cargo alto só ganha função extra via departamento".
 * @param {object} caps  Caps já resolvidas pelo authz.js original.
 * @param {object} raw   Payload do JWT autenticado.
 * @param {object=} dbRow Linha bruta de v_user_caps (quando aplicável).
 * @returns {object} caps corrigidas.
 */
export function applyCargoOnlyDeptRule(caps, raw, dbRow){
  if(!caps) return caps;
  if(_isRootAdm(raw)) return caps;

  const code = _resolveCode(raw);
  if(!code || !HIGH_ROLES.has(code)) return caps;

  const admExtraManual = _hasAdmExtraManual(raw, dbRow);

  if(_hasDept(raw, dbRow)){
    return {
      escopo:       caps.escopo && caps.escopo!=='self' ? caps.escopo : 'team',
      leads:        caps.leads    || 'crud',
      negocios:     caps.negocios || 'crud',
      foreign:      caps.foreign  || 'edit',
      stageGated:   !!caps.stageGated,
      adminUI:      admExtraManual===true, // nunca mais automático por cargo
      supervisorUI: true,
    };
  }

  // Sem departamento -> básico de consultor.
  if(admExtraManual){
    return {
      escopo:'self', leads:'crud', negocios:'crud', foreign:'none',
      stageGated:false, adminUI:true, supervisorUI:true,
    };
  }
  return { ...CAPS_BASIC_CONSULTOR };
}

/**
 * Helper opcional: envelopa uma função `resolveUserCaps(cfg, raw)` existente
 * para aplicar a regra sem editar o corpo original.
 */
export function wrapResolveUserCaps(originalResolve){
  return async function patchedResolve(cfg, raw){
    const caps = await originalResolve(cfg, raw);
    return applyCargoOnlyDeptRule(caps, raw, null);
  };
}
