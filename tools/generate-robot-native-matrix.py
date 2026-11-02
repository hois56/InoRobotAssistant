#!/usr/bin/env python3
"""Generate the binary-free native robot matrix arithmetic.

Requires capstone and pyelftools. Inputs are the original ARM libraries;
this deliberately narrow instruction translator fails on unsupported code.
No robot connection, binary execution, or automatic dependency installation.
"""
import argparse,collections,hashlib,io,json,re,struct,sys
from pathlib import Path

Cs=CS_ARCH_ARM=CS_MODE_ARM=ELFFile=None

def load_dependencies():
    global Cs,CS_ARCH_ARM,CS_MODE_ARM,ELFFile
    try:
        from capstone import Cs,CS_ARCH_ARM,CS_MODE_ARM
        from elftools.elf.elffile import ELFFile
    except ImportError as error:
        raise RuntimeError('Missing generator dependency: capstone and pyelftools are required. '
                           'Install them in your chosen Python environment with '
                           'python -m pip install capstone pyelftools; this tool does not install packages.') from error

class Binary:
    def __init__(self,path):
        self.path=Path(path);self.raw=self.path.read_bytes()
        self.elf=ELFFile(io.BytesIO(self.raw))
        if self.elf['e_machine']!='EM_ARM' or self.elf.elfclass!=32 or not self.elf.little_endian:
            raise ValueError(f'{self.path}: expected a 32-bit little-endian ARM ELF library')
        self.symbols={}
        for key in ['.dynsym','.symtab']:
            section=self.elf.get_section_by_name(key)
            if section:
                for symbol in section.iter_symbols():
                    if symbol['st_value']:self.symbols[symbol.name]=symbol
        self.labels={symbol['st_value']&~1:name for name,symbol in self.symbols.items() if not name.startswith('$')}
        relocations=self.elf.get_section_by_name('.rel.plt');plt=self.elf.get_section_by_name('.plt')
        if relocations and plt:
            symbols=self.elf.get_section(relocations['sh_link'])
            for index,relocation in enumerate(relocations.iter_relocations()):
                self.labels[plt['sh_addr']+20+12*index]=symbols.get_symbol(relocation['r_info_sym']).name
    def read(self,address,size):
        for segment in self.elf.iter_segments():
            if segment['p_type']=='PT_LOAD' and segment['p_vaddr']<=address<segment['p_vaddr']+segment['p_filesz']:
                offset=address-segment['p_vaddr']+segment['p_offset']
                result=self.raw[offset:offset+size]
                if len(result)==size:return result
        raise ValueError(f'{self.path}: no complete {size}-byte ELF range at0x{address:x}')

REG={'sp':13,'lr':14,'pc':15,'ip':12,'fp':11,'sl':10,'sb':9}
def reg(token):
 token=token.strip();return REG[token] if token in REG else int(token[1:])
def split(s):
 return [x.strip() for x in re.split(r',\s*(?![^\[{}]*[\]}])',s)]
def ri(token):
 token=token.strip();return str(int(token[1:],0)) if token.startswith('#') else f'r[{reg(token)}]'
def vr(token):return ('s' if token[0]=='s' else 'd')+f'[{int(token[1:])}]'
def number(n):
 if n!=n:return 'NaN'
 if n==float('inf'):return 'Infinity'
 if n==float('-inf'):return '-Infinity'
 return repr(n)
def emit(binary,name,output_name):
 sym=binary.symbols[name];start=sym['st_value'];cs=Cs(CS_ARCH_ARM,CS_MODE_ARM);cs.skipdata=True
 ins={i.address:i for i in cs.disasm(binary.read(start,sym['st_size']),start)}
 lines=[];count=collections.Counter();pc=start;visited=set()
 while pc in ins:
  if pc in visited:raise ValueError('Unexpected loop in matrix kernel')
  visited.add(pc);i=ins[pc];m=i.mnemonic;ops=split(i.op_str);pc+=4
  if m=='b':pc=int(i.op_str[1:],16);continue
  if m=='bx':assert i.op_str=='lr';break
  count[m]+=1;code=''
  if m in ['push','vpush','pop','vpop']:
   registers=i.op_str.strip('{}').split(',');size=len(registers)*(8 if m.startswith('v') else 4)
   code=f'r[13] {"-=" if m.endswith("push") else "+="} {size};'
  elif m in ['mov','add','sub']:
   dst=f'r[{reg(ops[0])}]'
   if m in ['add','sub'] and ops[1]=='pc':
    # Native SCARA obtains a literal double through ADD PC followed by LDM.
    # Resolve these read-only words at generation time; scratch memory uses a
    # different address space and must never treat native PC as a scratch ptr.
    literal=i.address+8+(1 if m=='add' else -1)*int(ops[2][1:],0)
    nxt=ins[pc];nops=split(nxt.op_str)
    assert nxt.mnemonic=='ldm' and nops[0]==ops[0],(i.op_str,nxt.op_str)
    registers=nops[1].strip('{}').split(',')
    code=' '.join(f'r[{reg(x)}] = {struct.unpack("<I",binary.read(literal+4*k,4))[0]};' for k,x in enumerate(registers))
    visited.add(pc);count['ldm']+=1;pc+=4
   else:code=f'{dst} = {ri(ops[1])}'+((' + ' if m=='add' else ' - ')+ri(ops[2]) if m!='mov' else '')+';'
  elif m in ['ldr','str','vldr','vstr']:
   mem=re.fullmatch(r'\[([a-z0-9]+)(?:,\s*([^\]]+))?\](!)?',ops[1]);assert mem,(m,ops)
   base,offset,writeback=mem.groups();offset=offset or '#0';off=ri(offset)
   address=f'({ri(base)} + {off})';literal=base=='pc'
   if literal:
    assert m in ['ldr','vldr'];a=i.address+8+int(offset[1:],0)
    fmt='d' if ops[0].startswith('d') else 'f' if ops[0].startswith('s') else 'I'
    value=struct.unpack('<'+fmt,binary.read(a,struct.calcsize(fmt)))[0]
    dst=vr(ops[0]) if m=='vldr' else f'r[{reg(ops[0])}]';code=f'{dst} = {number(value)};'
   else:
    if m=='ldr':code=f'r[{reg(ops[0])}] = u[{address} >>> 2];'
    elif m=='str':code=f'u[{address} >>> 2] = {ri(ops[0])};'
    elif ops[0].startswith('s'):
     code=f'{vr(ops[0])} = fm[{address} >>> 2];' if m=='vldr' else f'fm[{address} >>> 2] = {vr(ops[0])};'
    else:
     code=f'{vr(ops[0])} = memory.getFloat64({address}, true);' if m=='vldr' else f'memory.setFloat64({address}, {vr(ops[0])}, true);'
    if writeback:code+=f' r[{reg(base)}] += {off};'
    if len(ops)>2:code+=f' r[{reg(base)}] += {ri(ops[2])};'
  elif m in ['ldm','stm']:
   base=ops[0].rstrip('!');registers=ops[1].strip('{}').split(',')
   code=f'a = {ri(base)}; '+' '.join((f'r[{reg(x)}] = u[(a + {4*k}) >>> 2];' if m=='ldm' else f'u[(a + {4*k}) >>> 2] = r[{reg(x)}];') for k,x in enumerate(registers))
   if ops[0].endswith('!'):code+=f' r[{reg(base)}] += {4*len(registers)};'
  elif m=='vmov':
   if len(ops)==3:
    if ops[0].startswith('d'):
     di=int(ops[0][1:])*2;code=f'vu[{di}] = {ri(ops[1])}; vu[{di+1}] = {ri(ops[2])};'
    else:
     di=int(ops[2][1:])*2;code=f'r[{reg(ops[0])}] = vu[{di}]; r[{reg(ops[1])}] = vu[{di+1}];'
   elif ops[0].startswith('s'):code=f'vu[{int(ops[0][1:])}] = {ri(ops[1])};'
   else:code=f'r[{reg(ops[0])}] = vu[{int(ops[1][1:])}];'
  elif m in ['vmov.f32','vmov.f64']:
   value=ops[1][1:] if ops[1].startswith('#') else vr(ops[1]);code=f'{vr(ops[0])} = {value};'
  elif m.startswith('vcvt.'):
   assert m in ['vcvt.f32.f64','vcvt.f64.f32'],m;code=f'{vr(ops[0])} = {vr(ops[1])};'
  elif m.startswith('vneg.'):
   code=f'{vr(ops[0])} = -{vr(ops[1])};'
  elif m.startswith(('vmul.','vadd.','vsub.','vdiv.','vmla.','vmls.','vnmla.','vnmls.','vnmul.')):
   op,precision=m.split('.');dst,left,right=map(vr,ops);product=f'{left} * {right}'
   if precision=='f32':product=f'Math.fround({product})'
   if op=='vmul':expr=product
   elif op=='vnmul':expr=f'-({product})'
   elif op=='vadd':expr=f'{left} + {right}'
   elif op=='vsub':expr=f'{left} - {right}'
   elif op=='vdiv':expr=f'{left} / {right}'
   elif op=='vmla':expr=f'{dst} + {product}'
   elif op=='vmls':expr=f'{dst} - {product}'
   elif op=='vnmla':expr=f'-{dst} - {product}'
   elif op=='vnmls':expr=f'{product} - {dst}'
   code=f'{dst} = {expr};'
  elif m=='bl':
   target=binary.labels.get(int(i.op_str[1:],16));assert target in ['aw_sin','aw_cos'],target
   code=f'cv[0] = r[0]; cv[1] = r[1]; cd[0] = Math.{"sin" if target=="aw_sin" else "cos"}(cd[0]); r[0] = cv[0]; r[1] = cv[1];'
  else:raise ValueError(f'Unsupported {hex(i.address)} {m} {i.op_str}')
  lines.append('  '+code)
 return f'export function {output_name}(memory, u, fm, r, vu, s, d, cv, cd) {{\n  let a = 0;\n'+'\n'.join(lines)+'\n}\n',dict(count)


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--six-lib',required=True,type=Path,help='Original libDyncLib_Six.so ELF path')
    parser.add_argument('--scara-lib',required=True,type=Path,help='Original libDyncLib_Scara.so ELF path')
    parser.add_argument('--output',required=True,type=Path,help='Output native-matrix-arithmetic.mjs path')
    parser.add_argument('--provenance-output',required=True,type=Path,help='Output JSON path for source hashes and instruction counts')
    args=parser.parse_args(argv)
    if not __debug__:
        parser.exit(2,'Generator error: run without Python -O; instruction validation assertions must remain enabled.\n')
    try:
        load_dependencies()
        parts=[];provenance={}
        for path,name,export in [
            (args.six_lib,'StandardInvDyncMatrixCalc_Six','nativeSixMatrixArithmetic'),
            (args.scara_lib,'StandardInvDyncMatrixCalc_Scara','nativeScaraMatrixArithmetic')
        ]:
            binary=Binary(path);text,count=emit(binary,name,export);parts.append(text)
            provenance[export]={'source':path.name,'symbol':name,'address':hex(binary.symbols[name]['st_value']),
                'bytes':binary.symbols[name]['st_size'],'sha256':hashlib.sha256(binary.raw).hexdigest(),'instructions':count}
        header='/** Generated lift of original SPC25 VFP matrix arithmetic. Do not hand edit.\n * Regenerate with tools/generate-robot-native-matrix.py; no binary is required at runtime.\n */\n'
        # Translate both libraries fully before writing either output.
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.provenance_output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(header+'\n'.join(parts),encoding='utf-8')
        args.provenance_output.write_text(json.dumps(provenance,indent=2),encoding='utf-8')
        print(json.dumps({name:sum(record['instructions'].values()) for name,record in provenance.items()}))
        return 0
    except (OSError,RuntimeError,ValueError,KeyError,AssertionError) as error:
        parser.exit(2,f'Generator error: {error}\n')

if __name__=='__main__':raise SystemExit(main())
