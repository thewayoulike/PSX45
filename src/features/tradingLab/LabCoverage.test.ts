import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {LabCoverage} from './LabCoverage';

describe('Trading Lab comparison visibility',()=>{
 it.each(['itruth2011@gmail.com','muhammadawais950@gmail.com',' ITRUTH2011@gmail.com '])('shows the panel for %s',email=>{
  expect(renderToStaticMarkup(React.createElement(LabCoverage,{email}))).toContain('Compared with the GitHub project');
 });
 it.each([undefined,null,'','other@gmail.com','itruth2011+test@gmail.com','itruth2011@gmail.com.example.com'])('renders nothing for unlisted account %s',email=>{
  expect(renderToStaticMarkup(React.createElement(LabCoverage,{email}))).toBe('');
 });
});
