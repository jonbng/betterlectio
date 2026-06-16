import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/context/student.dart';
import 'package:lectio_wrapper/types/message/meta/meta.dart';
import 'package:lectio_wrapper/utils/dio_image_provider.dart';
import 'package:betterlectio/logic/student/student_bloc.dart';
import 'package:betterlectio/logic/student/student_cubit.dart';
import 'package:betterlectio/widgets/loading/student_bloc_builder.dart';

class StudentImage extends StatelessWidget {
  const StudentImage(
      {super.key,
      required this.entry,
      this.small = false,
      this.size = 40.0,
      this.quality = false});
  final MetaDataEntry? entry;
  final bool small;
  final double size;
  final bool quality;
  @override
  Widget build(BuildContext context) {
    var acSize = small ? 30.0 : size;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: const BoxDecoration(shape: BoxShape.circle),
      height: acSize,
      width: acSize,
      child: entry != null
          ? StudentBlocBuilder<StudentCubit<DioImage>, DioImage?>(
              bloc: StudentCubit(
                  student: getStudentBloc(context).state.student!,
                  selector: (primaryStudent) async => primaryStudent.getImage(
                      (await primaryStudent.context.get(entry!.id)
                              as StudentContext)
                          .imageId,
                      fullsize: quality))
                ..load(),
              builder: (context, state) {
                return CircleAvatar(
                  radius: 24.0,
                  foregroundImage: state,
                );
              },
            )
          : const CircleAvatar(
              radius: 24.0,
            ),
    );
  }
}
