import random  # 用于生成随机数
import math    # 用于数学计算
import numpy as np  # 用于数值计算
import pandas as pd  # 用于数据处理和Excel文件输出
import time  # 用于性能测试

# 全局变量定义
RAT_DIST = 10           # 分数差异的权重系数
# (range_val ** 2 / total_count * RAT_DIST)
# RAT_DIST 的算法：比如分成5个班，前50名分为[9,9,10,11,11]被认为是临界分布，此时dist=4/50； 平均分极差0.1*1=1被认为是临界分布
# 因此此时的RAT_DIST = 12.5
special_requirements = []  # 存储特殊分班要求的列表
classmate_num = []      # 存储每个班级的学生人数
weight = []             # 存储各学科和类别的权重系数

class OptimizedStudent:
    """
    优化版学生类 - 使用numpy数组提高性能
    """
    def __init__(self, scores, categories, class_index):
        self.scores = np.array(scores, dtype=np.float32)
        self.categories = np.array(categories, dtype=np.int32)
        self.class_index = class_index

def evaluate_simple(students):
    """
    简化的评估函数 - 直接重新计算，不使用增量更新
    """
    # 重新计算所有统计信息
    class_score_sums = np.zeros((class_num, subject_num), dtype=np.float32)
    class_sizes = np.zeros(class_num, dtype=np.int32)
    class_distributions = np.zeros((class_num, category_num), dtype=np.int32)
    
    # 统计各班级信息
    for student in students:
        cls = student.class_index
        class_sizes[cls] += 1
        class_score_sums[cls] += student.scores
        class_distributions[cls] += student.categories
    
    # 计算平均分
    class_averages = np.zeros((class_num, subject_num), dtype=np.float32)
    for cls in range(class_num):
        if class_sizes[cls] > 0:
            class_averages[cls] = class_score_sums[cls] / class_sizes[cls]
    
    # 计算评估分数
    score_diff = 0.0
    
    # 1. 各科平均分差异
    for j in range(subject_num):
        subject_avgs = class_averages[:, j]
        range_val = np.max(subject_avgs) - np.min(subject_avgs)
        score_diff += (range_val * 10) ** 2 * weight[j]
    
    # 2. 类别分布差异
    dist_diff = 0.0
    for j in range(category_num):
        category_counts = class_distributions[:, j]
        total_count = np.sum(category_counts)
        
        if total_count > 0:
            range_val = np.max(category_counts) - np.min(category_counts)
            dist_diff += (range_val ** 2 / total_count * RAT_DIST) ** 2 * weight[j + subject_num]

    # 3. 特殊要求惩罚
    special_penalty = 0
    for req in special_requirements:
        req_type, student1_idx, student2_or_class = req[0], req[1], req[2]
        
        if req_type == 1:  # 必须在同一班
            if students[student1_idx].class_index != students[student2_or_class].class_index:
                special_penalty += 300
        elif req_type == 2:  # 必须不在同一班
            if students[student1_idx].class_index == students[student2_or_class].class_index:
                special_penalty += 300
        elif req_type == 3:  # 必须在指定班级
            if students[student1_idx].class_index != student2_or_class:
                special_penalty += 300
    
    total_score = score_diff + dist_diff + special_penalty
    
    return total_score, class_averages, class_distributions

def simulated_annealing(students, iterations, initial_temp, cooling_rate, end_temp=1):
    """
    模拟退火算法 - 生产版本
    """
    print("正在运行模拟退火算法...")
    start_time = time.time()
    
    current_T = initial_temp
    current_eval, current_avg, current_dist = evaluate_simple(students)
    best_eval = current_eval
    best_solution = [student.class_index for student in students]
    
    print(f"初始评估分数: {current_eval:.2f}")
    
    total_iterations = 0
    accepted_moves = 0
    temperature_round = 0
    
    while current_T > end_temp:
        temperature_round += 1
        temperature_accepted = 0
        
        for iteration in range(iterations):
            total_iterations += 1
            
            # 随机选择两个不同班级的学生
            attempts = 0
            while attempts < 50:
                idx_a, idx_b = random.sample(range(len(students)), 2)
                if students[idx_a].class_index != students[idx_b].class_index:
                    break
                attempts += 1
            
            if attempts >= 50:
                continue
                
            student_a, student_b = students[idx_a], students[idx_b]
            old_class_a, old_class_b = student_a.class_index, student_b.class_index
            
            # 执行交换
            student_a.class_index, student_b.class_index = old_class_b, old_class_a
            
            # 计算新的评估分数
            new_eval, new_avg, new_dist = evaluate_simple(students)
            
            # 验证评估函数是否正常
            if math.isnan(new_eval) or math.isinf(new_eval):
                # 回滚
                student_a.class_index, student_b.class_index = old_class_a, old_class_b
                continue
            
            # 决定是否接受新解
            accept = False
            delta = new_eval - current_eval
            
            if delta <= 0:  # 新解更好或相等
                accept = True
            elif current_T > 0:
                probability = math.exp(-delta / current_T)
                if random.random() < probability:
                    accept = True
            
            if accept:
                current_eval = new_eval
                accepted_moves += 1
                temperature_accepted += 1
                
                if current_eval < best_eval:
                    best_eval = current_eval
                    best_solution = [student.class_index for student in students]
            else:
                # 回滚交换
                student_a.class_index, student_b.class_index = old_class_a, old_class_b
        
        # 降温
        current_T *= cooling_rate
        temp_acceptance_rate = temperature_accepted / iterations * 100
        overall_acceptance_rate = accepted_moves / total_iterations * 100
        
        print(f"温度 {current_T:.2f} - 最佳分数 {best_eval:.2f} - "
              f"本轮接受率 {temp_acceptance_rate:.1f}% - 总接受率 {overall_acceptance_rate:.1f}%")
    
    # 恢复最佳解
    for i, class_idx in enumerate(best_solution):
        students[i].class_index = class_idx
    
    total_time = time.time() - start_time
    print(f"\n优化完成！总耗时: {total_time:.1f}秒")
    print(f"总迭代次数: {total_iterations:,}")
    print(f"总体接受率: {accepted_moves/total_iterations*100:.2f}%")
    print(f"最终最佳分数: {best_eval:.2f}")
    
    return students

def create_excel_output(students, ans_avg, ans_dtb):
    """
    生成Excel文件输出分班结果
    """
    print("正在生成Excel文件...")
    
    with pd.ExcelWriter('分班结果quick.xlsx', engine='openpyxl') as writer:
        
        # 1. 各班平均分
        subject_columns = [f"学科{j+1}" for j in range(subject_num)]
        avg_data = []
        class_names = []
        
        for i in range(class_num):
            class_names.append(f"{i}班")
            avg_data.append([round(ans_avg[i][j], 2) for j in range(subject_num)])
        
        df_avg = pd.DataFrame(avg_data, columns=subject_columns, index=class_names)
        df_avg.to_excel(writer, sheet_name='各班平均分', index=True)
        
        # 2. 各班各类人数
        category_columns = [f"类别{j+1}" for j in range(category_num)]
        dist_data = []
        
        for i in range(class_num):
            dist_data.append([int(ans_dtb[i][j]) for j in range(category_num)])
        
        df_dist = pd.DataFrame(dist_data, columns=category_columns, index=class_names)
        df_dist.to_excel(writer, sheet_name='各班各类人数', index=True)
        
        # 3. 学生分配详情
        student_data = []
        for i, student in enumerate(students):
            row = [f"学生{i}"]
            row.extend([round(score, 2) for score in student.scores])
            row.extend([int(cat) for cat in student.categories])
            row.append(f"{student.class_index}班")
            student_data.append(row)
        
        student_columns = ["学生编号"] + subject_columns + category_columns + ["分配班级"]
        df_students = pd.DataFrame(student_data, columns=student_columns)
        df_students.to_excel(writer, sheet_name='学生分配详情', index=False)
        
        # 4. 统计汇总
        summary_data = []
        
        # 各科平均分极差
        for j in range(subject_num):
            subject_scores = [ans_avg[i][j] for i in range(class_num)]
            max_score = max(subject_scores)
            min_score = min(subject_scores)
            range_score = max_score - min_score
            summary_data.append([f"学科{j+1}", f"{min_score:.2f}", f"{max_score:.2f}", f"{range_score:.2f}"])
        
        # 各类别人数极差
        for j in range(category_num):
            category_counts = [ans_dtb[i][j] for i in range(class_num)]
            max_count = max(category_counts)
            min_count = min(category_counts)
            range_count = max_count - min_count
            summary_data.append([f"类别{j+1}", f"{int(min_count)}", f"{int(max_count)}", f"{int(range_count)}"])
        
        df_summary = pd.DataFrame(summary_data, columns=["项目", "最小值", "最大值", "极差"])
        df_summary.to_excel(writer, sheet_name='分布统计汇总', index=False)
    
    print("Excel文件 '分班结果.xlsx' 已生成完成！")

def main():
    global student_num, class_num, subject_num, category_num, weight, special_requirements
    
    print("=== 入学分班程序 ===")
    print("基于模拟退火算法的智能分班系统")
    print()
    
    print("请输入学生人数")
    student_num = int(input())
    
    print("请输入班级数目")
    class_num = int(input())
    
    print("请输入学科种类")
    subject_num = int(input())
    
    print("请输入类别的个数")
    category_num = int(input())
    
    print(f"下面，输入{student_num}行学生数据")
    
    # 初始化
    students = []
    classmate_num = [0] * class_num
    
    # 读取学生信息
    for i in range(student_num):
        s = input()
        a = list(map(float, s.split()))
        
        students.append(OptimizedStudent(
            a[0:subject_num], 
            a[subject_num:], 
            i % class_num
        ))
        classmate_num[i % class_num] += 1
    
    print(f"请输入条件的比例系数，共{subject_num+category_num}个数")
    weight = list(map(int, input().split()))
    
    print("请输入特殊条件，以-1结尾")
    while True:
        s = input()
        ty = list(map(int, s.split()))
        if ty[0] == -1:
            break
        special_requirements.append(ty)
    
    print(f"\n数据读取完成:")
    print(f"学生数: {student_num}, 班级数: {class_num}, 学科数: {subject_num}, 类别数: {category_num}")
    print(f"权重: {weight}")
    print(f"特殊要求数: {len(special_requirements)}")
    
    # 检查初始评估
    initial_eval, initial_avg, initial_dist = evaluate_simple(students)
    print(f"初始评估分数: {initial_eval:.2f}")
    
    # 模拟退火参数
    print("\n=== 开始模拟退火优化 ===")
    iterations = 10000      # 恢复正常迭代次数
    initial_T = 10000       # 合理的初始温度
    cooling_rate = 0.7
    end_temp = 1
    
    print(f"算法参数: iterations={iterations}, initial_T={initial_T}, cooling_rate={cooling_rate}, end_temp=1")
    
    # 执行模拟退火
    students = simulated_annealing(students, iterations, initial_T, cooling_rate, end_temp)
    
    # 输出最终结果
    final_eval, final_avg, final_dist = evaluate_simple(students)
    print(f"\n最终评估分数: {final_eval:.2f}")
    
    # 生成Excel文件
    create_excel_output(students, final_avg.tolist(), final_dist.tolist())
    
    print("\n各班平均分:")
    for i in range(class_num):
        print(f"{i}班:\t", end="")
        for j in range(subject_num):
            print(f"{final_avg[i][j]:.2f}\t", end="")
        print()
    
    print("\n各班各类人数:")
    for i in range(class_num):
        print(f"{i}班:\t", end="")
        for j in range(category_num):
            print(f"{int(final_dist[i][j])}\t", end="")
        print()
    
    print("\n各班总人数:")
    final_class_counts = [0] * class_num
    for student in students:
        final_class_counts[student.class_index] += 1
    for i, count in enumerate(final_class_counts):
        print(f"{i}班: {count}人")
    
    print(f"\n分班优化完成！总学生数: {sum(final_class_counts)}")

if __name__ == "__main__":
    main()
