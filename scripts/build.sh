#!/bin/bash

if [ -n "$BASH_SOURCE" ]; then
    SCRIPT_PATH="$BASH_SOURCE"
elif [ -n "$ZSH_VERSION" ]; then
    SCRIPT_PATH="${(%):-%x}"
else
    SCRIPT_PATH="$0"
fi
[ -z "$SCRIPT_PATH" ] && SCRIPT_PATH="$0"
if __dir="$(cd -- "$(dirname -- "$SCRIPT_PATH" 2>/dev/null)" && pwd -P 2>/dev/null)"; then
    SCRIPT_DIR="$__dir"
elif __dir="$(cd -- "$(dirname -- "$0")" && pwd -P 2>/dev/null)"; then
    SCRIPT_DIR="$__dir"
else
    SCRIPT_DIR="$(pwd -P 2>/dev/null || echo "/tmp")"
fi
ROOT_DIR="$(realpath "${SCRIPT_DIR}/../")"
PWD_DIR_NAME="$(basename "${SCRIPT_DIR}")"
PWD_DIR="$(pwd)"

arg_build_mode="upto"
arg_cmake_build_type="RelWithDebInfo"

arg_console_handlers=""
arg_skip_finished=true
arg_clean_cache=false
arg_packages=""
arg_preserve_3rdparty=false

arg_install_dir="${ROOT_DIR}/install"
arg_build_dir="${ROOT_DIR}/build"
arg_dist_dir="${ROOT_DIR}/dist"
arg_work_dir="${ROOT_DIR}/src"
arg_log_dir="${ROOT_DIR}/log"

while [ $# -gt 0 ]; do
    case "$1" in
        --build-mode)
            if [ "$2" = "select" ] || [ "$2" = "upto" ]; then
                arg_build_mode="$2"
                shift 2
            else
                echo "Error: Invalid build mode. Use 'select', 'upto'."
                exit 1
            fi
            ;;
        --console-handlers)
            arg_console_handlers="$2"
            shift 2
            ;;
        --debug)
            arg_cmake_build_type="Debug"
            shift
            ;;
        --log-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2"
                arg_log_dir="$(realpath "$2")"
                shift 2
            else
                echo "Error: Invalid log dir."
                exit 1
            fi
            ;;
        --dist-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2"
                arg_dist_dir="$(realpath "$2")"
                shift 2
            else
                echo "Error: Invalid dist dir."
                exit 1
            fi
            ;;
        --work-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2"
                arg_work_dir="$(realpath "$2")"
                shift 2
            else
                echo "Error: Invalid work dir."
                exit 1
            fi
            ;;
        --build-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2"
                arg_build_dir="$(realpath "$2")"
                shift 2
            else
                echo "Error: Invalid build dir."
                exit 1
            fi
            ;;
        --install-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2"
                arg_install_dir="$(realpath "$2")"
                shift 2
            else
                echo "Error: Invalid install dir."
                exit 1
            fi
            ;;
        --packages)
            shift
            while [ $# -gt 0 ] && ! echo "$1" | grep -q "^--"; do
                if [ -z "${arg_packages}" ]; then
                    arg_packages="$1"
                else
                    arg_packages="${arg_packages} $1"
                fi
                shift
            done
            if [ -z "${arg_packages}" ]; then
                echo "Error: --packages requires at least one value"
                exit 1
            fi
            ;;
        --skip-finished)
            if [ "$2" = "true" ] || [ "$2" = "false" ]; then
                arg_skip_finished="$2"
                shift 2
            else
                echo "Error: Invalid skip finished option. Use 'true', or 'false'."
                exit 1
            fi
            ;;
        --clean-cache)
            if [ "$2" = "true" ] || [ "$2" = "false" ]; then
                arg_clean_cache="$2"
                shift 2
            else
                echo "Error: Invalid clean cache option. Use 'true', or 'false'."
                exit 1
            fi
            ;;
        --preserve-3rdparty)
            if [ "$2" = "true" ] || [ "$2" = "false" ]; then
                arg_preserve_3rdparty="$2"
                shift 2
            else
                echo "Error: Invalid preserve 3rdparty option. Use 'true', or 'false'."
                exit 1
            fi
            ;;
        *)
            echo "Error: Unknown parameter $1"
            exit 1
            ;;
    esac
done

echo "Set install dir as:${arg_install_dir}"
echo "Set build dir as:${arg_build_dir}"
echo "Set work dir as:${arg_work_dir}"

# install platform dependency packages
export PATH="$HOME/.pixi/bin:$PATH"
export PIXI_CACHE_DIR=${ROOT_DIR}/.pixi-cache
echo "enter pixi environment dir ${ROOT_DIR}..."
cd "${ROOT_DIR}" || { echo "Unable to enter directory: ${ROOT_DIR}"; exit 1; }
echo "pixi lock..."
pixi lock
echo "pixi install..."
pixi install --use-environment-activation-cache
PIXI_ENV_PATH=$(pixi run bash -c "echo \$CONDA_PREFIX")
PIXI_LIB_PATH="${PIXI_ENV_PATH}/lib"

echo "Enter root directory ${ROOT_DIR}..."
cd "${ROOT_DIR}" || { echo "Unable to enter directory: ${ROOT_DIR}"; exit 1; }
base_paths="${SCRIPT_DIR}/src"
addon_cmds=""
if [ -n "${arg_packages}" ]; then
    base_paths="${base_paths} ${SCRIPT_DIR}/src ${arg_work_dir}"
    if [ "${arg_build_mode}" = "select" ]; then
        echo "Set packages select ${arg_packages}..."
        addon_cmds="${addon_cmds} --packages-select ${arg_packages}"
    elif [ "${arg_build_mode}" = "upto" ]; then
        echo "Set packages up to ${arg_packages}..."
        addon_cmds="${addon_cmds} --packages-up-to ${arg_packages}"
    else
        echo "unknown build mode ${arg_build_mode}..."
        exit 1
    fi
else
    echo "Set packages up to ms_rcs..."
    addon_cmds="${addon_cmds} --packages-up-to ms_rcs"
fi
if [ "${arg_skip_finished}" = "true" ]; then
    echo "Set packages skip build finished..."
    addon_cmds="${addon_cmds} --packages-skip-build-finished"
fi
if [ "${arg_preserve_3rdparty}" = "true" ]; then
    echo "Preserving 3rdparty directories..."
    preserve_3rdparty "${arg_build_dir}"
fi
if [ "${arg_clean_cache}" = "true" ]; then
    echo "Set packages cmake clean cache..."
    addon_cmds="${addon_cmds} --cmake-clean-cache"
fi
if [ -e "${arg_install_dir}/local_setup.bash" ]; then
    echo "bash ${arg_install_dir}/local_setup.bash..."
    bash "${arg_install_dir}/local_setup.bash"
fi

unset CATKIN_INSTALL_INTO_PREFIX_ROOT
export CPLUS_INCLUDE_PATH="${PIXI_ENV_PATH}/include:$CPLUS_INCLUDE_PATH"
export PKG_CONFIG_PATH="$PIXI_LIB_PATH/pkgconfig:$PKG_CONFIG_PATH"
export C_INCLUDE_PATH="${PIXI_ENV_PATH}/include:$C_INCLUDE_PATH"
export CMAKE_INCLUDE_PATH="${PIXI_ENV_PATH}/include"
export LD_LIBRARY_PATH="$PIXI_LIB_PATH:/usr/lib"
export LIBRARY_PATH="$PIXI_LIB_PATH:/usr/lib"
export CMAKE_FIND_ROOT_PATH="${PIXI_ENV_PATH}:${arg_build_dir}"
export CMAKE_FIND_ROOT_PATH_MODE_LIBRARY=ONLY
export CMAKE_BUILD_PARALLEL_LEVEL=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)
export CMAKE_SUPPRESS_DEVELOPER_WARNINGS=ON
export CMAKE_PREFIX_PATH="${PIXI_ENV_PATH}:${arg_install_dir}"
export PIXI_ENV_PATH="${PIXI_ENV_PATH}"
if [ "$(uname -s)" = "Darwin" ]; then
    export SDKROOT="$(xcrun --show-sdk-path)"
fi

preserve_3rdparty() {
    local build_dir="$1"
    local backup_tar="/tmp/msrcs-3rdparty-backup-$$.tar.gz"
    [ -f "$backup_tar" ] && rm -f "$backup_tar"
    local dirs=$(find "$build_dir" -maxdepth 6 -type d \( -name 3rdparty -o -name openctk_vendor -o -name qext_vendor \) 2>/dev/null)
    if [ -n "$dirs" ]; then
        (cd "$build_dir" && echo "$dirs" | sed "s|^$build_dir/||g" | tar czf "$backup_tar" -T -)
    fi
    trap 'if [ -f "$backup_tar" ]; then tar xzf "$backup_tar" -C "$build_dir"; rm -f "$backup_tar"; fi' EXIT
    rm -rf "$build_dir"/*
    if [ -f "$backup_tar" ] && [ -s "$backup_tar" ]; then
        tar xzf "$backup_tar" -C "$build_dir"
    fi
    rm -f "$backup_tar"
    trap - EXIT
}
echo "Build type: ${arg_cmake_build_type}"
echo "Building packages..."
pixi run colcon \
    --log-base ${arg_log_dir} \
    build --event-handlers ${arg_console_handlers}\
    --parallel-workers 6 \
    --merge-install \
    --base-path ${base_paths} \
    --build-base ${arg_build_dir} \
    --install-base ${arg_install_dir} \
    ${addon_cmds} \
    --cmake-args \
    -G "Ninja" \
    "-DCMAKE_PREFIX_PATH=${PIXI_ENV_PATH}:${arg_install_dir}" \
    "-DCMAKE_BUILD_TYPE=${arg_cmake_build_type}" \
    -DAMENT_CMAKE_UNINSTALL_TARGET=OFF \
    -DBUILD_TESTING=OFF

# Generate compile_commands.json for clangd LSP
echo "Generating compile_commands.json..."
BUILD_DIR="${arg_build_dir}" bash "${SCRIPT_DIR}/gen-compile-db.sh" || \
    echo "Warning: compile_commands.json generation failed (non-fatal)"


# ------------------------------------------------------------------------------------------
# Build web frontend (delegated to package-level build.sh — same pattern as MSRTC)
# ------------------------------------------------------------------------------------------
web_build_script="${ROOT_DIR}/src/ms_rcs_config/web/build.sh"
if [ -x "${web_build_script}" ]; then
    echo "Building web frontend..."
    bash "${web_build_script}" --output-dir "${arg_install_dir}"
fi