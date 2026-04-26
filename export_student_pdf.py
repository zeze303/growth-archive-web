import json
import sys
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))

base_dir = Path(__file__).resolve().parent
if len(sys.argv) != 3:
    raise SystemExit('Usage: python export_student_pdf.py <input_json> <output_pdf>')

input_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])
data = json.loads(input_path.read_text(encoding='utf-8'))
student = data['student']
records = data['records']
comparison = data.get('comparison', {})

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='CNTitle', parent=styles['Title'], fontName='STSong-Light', fontSize=20, leading=26, textColor=colors.HexColor('#1f3f75')))
styles.add(ParagraphStyle(name='CNHeading', parent=styles['Heading2'], fontName='STSong-Light', fontSize=13, leading=18, textColor=colors.HexColor('#1f3f75')))
styles.add(ParagraphStyle(name='CNBody', parent=styles['BodyText'], fontName='STSong-Light', fontSize=10.5, leading=16, textColor=colors.HexColor('#24324a')))
styles.add(ParagraphStyle(name='CNMeta', parent=styles['BodyText'], fontName='STSong-Light', fontSize=9.5, leading=14, textColor=colors.HexColor('#5d6a82')))
styles.add(ParagraphStyle(name='CNTable', parent=styles['BodyText'], fontName='STSong-Light', fontSize=8.6, leading=11, textColor=colors.HexColor('#24324a'), wordWrap='CJK'))


def esc(text):
    return str(text or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

story = []
story.append(Paragraph(f"{esc(student.get('name'))} 成长档案报告", styles['CNTitle']))
story.append(Spacer(1, 0.4 * cm))
story.append(Paragraph(f"学校：{esc(student.get('school'))}　　班级：{esc(student.get('gradeClass'))}", styles['CNBody']))
story.append(Paragraph(f"监护人：{esc(student.get('guardian'))}　　联系电话：{esc(student.get('phone'))}", styles['CNBody']))
story.append(Paragraph(f"联系地址：{esc(student.get('address'))}", styles['CNBody']))
story.append(Paragraph(f"公开备注：{esc(student.get('publicNote') or student.get('note') or '暂无')}", styles['CNMeta']))
story.append(Spacer(1, 0.45 * cm))
story.append(Paragraph('一、学生基本概况', styles['CNHeading']))
story.append(Paragraph(f"档案创建时间：{esc(student.get('createdAt'))}", styles['CNBody']))
story.append(Paragraph(f"同校平均分：{esc(comparison.get('schoolAverage', 0))}　　同班平均分：{esc(comparison.get('classAverage', 0))}", styles['CNBody']))
story.append(Spacer(1, 0.35 * cm))
story.append(Paragraph('二、成长记录概览', styles['CNHeading']))

rows = [['周期', '美育', '财商', '心理', '行为', '总分', '等级', '预警标签']]
for record in records:
    rows.append([
        Paragraph(esc(record.get('period', '')), styles['CNTable']),
        Paragraph(str(record.get('scores', {}).get('aesthetic', '')), styles['CNTable']),
        Paragraph(str(record.get('scores', {}).get('finance', '')), styles['CNTable']),
        Paragraph(str(record.get('scores', {}).get('psychology', '')), styles['CNTable']),
        Paragraph(str(record.get('scores', {}).get('behavior', '')), styles['CNTable']),
        Paragraph(str(record.get('totalScore', '')), styles['CNTable']),
        Paragraph(esc(record.get('level', '')), styles['CNTable']),
        Paragraph(esc('；'.join(record.get('warningTags', [])) or '无'), styles['CNTable'])
    ])

table = Table(rows, repeatRows=1, colWidths=[2.8*cm, 1.1*cm, 1.1*cm, 1.1*cm, 1.1*cm, 1.2*cm, 1.4*cm, 6.2*cm])
table.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'STSong-Light'),
    ('FONTSIZE', (0, 0), (-1, 0), 8.8),
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dce8ff')),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#1f3f75')),
    ('GRID', (0, 0), (-1, -1), 0.35, colors.HexColor('#cfd9ea')),
    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fbff')]),
    ('LEFTPADDING', (0, 0), (-1, -1), 5),
    ('RIGHTPADDING', (0, 0), (-1, -1), 5),
    ('TOPPADDING', (0, 1), (-1, -1), 6),
    ('BOTTOMPADDING', (0, 1), (-1, -1), 6)
]))

story.append(table)
story.append(Spacer(1, 0.45 * cm))
story.append(Paragraph('三、趋势摘要', styles['CNHeading']))
for record in records:
    story.append(Paragraph(f"• {esc(record.get('period'))}：总分 {esc(record.get('totalScore'))}，等级 {esc(record.get('level'))}。", styles['CNBody']))
story.append(Spacer(1, 0.35 * cm))
story.append(Paragraph('四、综合评语汇总', styles['CNHeading']))
for record in records:
    story.append(Paragraph(f"{esc(record.get('period'))}：{esc(record.get('comments', {}).get('overall') or '暂无综合评语')}", styles['CNBody']))

output_path.parent.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(str(output_path), pagesize=A4, leftMargin=1.8*cm, rightMargin=1.8*cm, topMargin=1.8*cm, bottomMargin=1.6*cm)
doc.build(story)
print(str(output_path))
