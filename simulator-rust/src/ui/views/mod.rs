mod arm_load_editor;
mod arm_load_panel;
mod base_jog_view;
mod cad_panel;
mod canvas_container;
mod collaboration_panel;
mod import_3d_dialog;
mod interference_zone_dialog;
mod io_function_mapping_dialog;
mod jog_panel;
mod main_content;
mod measurement_panel;
mod model_browser_panel;
mod model_context_menu;
mod model_export_dialog;
mod model_transform_panel;
mod model_zero_point_editor;
mod olp_point_context_menu;
mod position_points_panel;
mod position_value_dialog;
mod program_panel;
mod program_step_context_menu;
mod recording_editor;
mod robot_model_choice_dialog;
mod shape_panel;
mod simulation_reset_dialog;
mod sketch_editor;
mod sketch_workbench;
mod stats_bar;
mod tcp_profile_editor;
mod tcp_profile_manager;
mod tcp_profile_panel;
mod test_model_dialog;
mod tool_attachment_dialog;
mod tool_load_info_panel;
mod topbar;
mod trace_panel;
mod view_presets_list;
mod view_presets_panel;
mod virtual_controller_panel;
mod work_origin_dialog;
mod workobject_panel;
mod workspace_recovery_dialog;

use super::{text, Node};

#[rustfmt::skip]
pub(super) const BODY: &[Node] = &[
    text("\n\n    "),
    topbar::VIEW,
    text("\n\n    "),
    simulation_reset_dialog::VIEW,
    text("\n\n    "),
    test_model_dialog::VIEW,
    text("\n\n    "),
    robot_model_choice_dialog::VIEW,
    text("\n\n    "),
    tool_attachment_dialog::VIEW,
    text("\n\n    "),
    workspace_recovery_dialog::VIEW,
    text("\n\n    "),
    import_3d_dialog::VIEW,
    text("\n\n    "),
    import_3d_dialog::SOLIDWORKS_REFERENCES,
    text("\n\n    "),
    position_value_dialog::VIEW,
    text("\n\n    "),
    work_origin_dialog::VIEW,
    text("\n\n    "),
    main_content::VIEW,
    recording_editor::VIEW,
    text("\n\n    "),
    interference_zone_dialog::VIEW,
    text("\n\n    "),
    program_step_context_menu::VIEW,
    text("\n    "),
    olp_point_context_menu::VIEW,
    text("\n    "),
    model_context_menu::VIEW,
    text("\n\n    "),
    model_export_dialog::VIEW,
    text("\n\n    "),
    stats_bar::VIEW,
    text("\n\n    "),
    text("\n"),
    text("\n\n\n"),
];
