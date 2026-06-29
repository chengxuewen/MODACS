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
PWD_DIR="$(pwd)"

unset ROS_DISTRO
unset ROS_PACKAGE_PATH
unset ROS_ETC_DIR
unset ROS_ROOT
unset ROS_MASTER_URI
unset ROS_PYTHON_VERSION
unset PYTHONPATH
unset LD_LIBRARY_PATH
unset AMENT_PREFIX_PATH
unset COLCON_PREFIX_PATH
unset COLCON_CURRENT_PREFIX

cd "${SCRIPT_DIR}" || { echo "Unable to enter directory: ${SCRIPT_DIR}"; exit 1; }

if [ ! -d "${SCRIPT_DIR}/env" ] || [ ! -f "${SCRIPT_DIR}/activate.sh" ]; then
    echo "${SCRIPT_DIR}/env or ${SCRIPT_DIR}/activate.sh not exist!"
    exit 1
fi
echo "source ${SCRIPT_DIR}/activate.sh..."
source "${SCRIPT_DIR}/activate.sh"

if [ -n "$ZSH_VERSION" ]; then
    autoload -Uz compinit bashcompinit
    compinit -i 2>/dev/null
    bashcompinit -i 2>/dev/null
    if ! type _ros2_completion &>/dev/null; then
        eval "$(register-python-argcomplete ros2)" 2>/dev/null
        eval "$(register-python-argcomplete colcon)" 2>/dev/null
        echo "Register-python-argcomplete (Zsh)"
    fi
elif [ -n "$BASH_VERSION" ]; then
    if ! type _python_argcomplete &>/dev/null; then
        eval "$(register-python-argcomplete ros2)" 2>/dev/null
        eval "$(register-python-argcomplete colcon)" 2>/dev/null
        echo "register-python-argcomplete (Bash)"
    fi
else
    echo "Unknown shell type，skip completion registration"
fi

export COLCON_CURRENT_PREFIX=${SCRIPT_DIR}
if [ -f "${SCRIPT_DIR}/local_setup.sh" ]; then
    echo "Source ${SCRIPT_DIR}/local_setup.sh..."
    source "${SCRIPT_DIR}/local_setup.sh"
fi

export LD_LIBRARY_PATH="${SCRIPT_DIR}/env/lib:$LD_LIBRARY_PATH"
export LD_LIBRARY_PATH=$(echo "$LD_LIBRARY_PATH" | awk -v RS=':' '!a[$1]++' | paste -sd: -)

export DYLD_LIBRARY_PATH="${SCRIPT_DIR}/env/lib:$DYLD_LIBRARY_PATH"
export DYLD_LIBRARY_PATH=$(echo "$DYLD_LIBRARY_PATH" | awk -v RS=':' '!a[$1]++' | paste -sd: -)

export PATH="${SCRIPT_DIR}/node_modules/.bin:$PATH"

cd "$PWD_DIR" || { echo "Unable to enter directory: $PWD_DIR"; exit 1; }
