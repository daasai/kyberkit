#!/bin/bash

# 文件统计 Shell 工具 (macOS 兼容版)
# 用法: ./dir_analyzer.sh [目录路径]

TARGET_DIR="${1:-.}"

if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ 错误: 目录 '$TARGET_DIR' 不存在"
    exit 1
fi

TARGET_DIR=$(cd "$TARGET_DIR" && pwd)

echo "========================================"
echo "📊 目录分析报告"
echo "========================================"
echo "📁 目标目录: $TARGET_DIR"
echo "📅 分析时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 统计总文件数
total_files=$(find "$TARGET_DIR" -type f | wc -l | tr -d ' ')

# 统计总目录数
total_dirs=$(find "$TARGET_DIR" -type d | wc -l | tr -d ' ')

# 统计隐藏文件数
hidden_files=$(find "$TARGET_DIR" -name ".*" -type f | wc -l | tr -d ' ')

echo ""
echo "📈 总体统计:"
echo "   • 总文件数: $total_files"
echo "   • 总目录数: $total_dirs (含根目录)"
echo "   • 隐藏文件: $hidden_files"
echo ""

# 按文件类型统计
echo "📋 文件类型分布 (Top 10):"
echo "------------------------------------------"

# 使用 awk 统计扩展名
find "$TARGET_DIR" -type f -name "*.*" | sed 's/.*\.//' | sort | uniq -c | sort -rn | head -10 | while read count ext; do
    printf "   .%-12s | %d 个文件\n" "$ext" "$count"
done

# 统计无扩展名文件
no_ext=$(find "$TARGET_DIR" -type f ! -name "*.*" | wc -l | tr -d ' ')
if [ "$no_ext" -gt 0 ]; then
    printf "   %-14s | %d 个文件\n" "[无扩展名]" "$no_ext"
fi

echo "------------------------------------------"

# 计算总大小
total_size=$(du -sh "$TARGET_DIR" 2>/dev/null | cut -f1)

echo ""
echo "💾 存储空间:"
echo "   • 总大小: $total_size"
echo ""

# 显示最大的5个文件
echo "📦 最大的5个文件:"
find "$TARGET_DIR" -type f -exec ls -lh {} \; 2>/dev/null | sort -k5 -hr | head -5 | awk '{printf "   • %s - %s\n", $5, $9}'

echo ""
echo "========================================"
echo "✅ 分析完成!"
echo "========================================"
