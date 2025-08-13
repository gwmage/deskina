
import csv
import os

def extract_db_definition(prisma_file_path):
    try:
        with open(prisma_file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        return None

    # 정규 표현식을 사용하여 테이블 및 컬럼 정보 추출 (필요에 따라 수정)
    # 이 부분은 schema.prisma 파일의 구조에 따라 수정이 필요합니다.
    # 예시는 간단한 구조를 가정합니다.
    import re
    tables = re.findall(r'model\s+(\w+)\s+\{([^}]+)\}', content, re.DOTALL)

    db_definition = []
    for table_name, columns_str in tables:
        columns = re.findall(r'(\w+)\s+([\w]+)', columns_str)
        for column_name, column_type in columns:
            db_definition.append([table_name, column_name, column_type])


    return db_definition


def save_to_csv(db_definition, csv_file_path):
    with open(csv_file_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(['Table Name', 'Column Name', 'Data Type'])
        writer.writerows(db_definition)

if __name__ == "__main__":
    prisma_file_path = 'server\prisma\schema.prisma'  # schema.prisma 파일의 경로
    csv_file_path = 'database_definition.csv'  # 생성할 CSV 파일의 경로
    db_definition = extract_db_definition(prisma_file_path)
    if db_definition:
        save_to_csv(db_definition, csv_file_path)
        print(f"CSV 파일 '{csv_file_path}' 생성 완료.")
    else:
        print(f"파일 '{prisma_file_path}'을 찾을 수 없습니다.")

